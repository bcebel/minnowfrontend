// app/neighborhood-chat.js
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter, Link } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentMedia from "../../components/WebTorrentMedia";
import AdMessage from "../../components/AdMessage";
import { NeighborhoodVideoReassembler } from "../../components/NeighborhoodVideoReassembler";

const safeFileName = (asset) =>
  asset.name || asset.fileName || asset.uri.split("/").pop() || "media";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const getFileType = (fileName) => {
  if (!fileName) return "unknown";
  const ext = fileName.split(".").pop()?.toLowerCase();

  // 🎯 FIX 1: Ensure all common video types are listed
  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";

  // 🎯 FIX 2: Ensure HEIC/HEIF and WEBP are explicitly listed as images
  if (
    ["jpg", "jpeg", "png", "gif", "avif", "heic", "heif", "webp"].includes(ext)
  )
    return "image";

  if (["pdf", "doc", "docx"].includes(ext)) return "document";

  return "unknown";
};

// Simple Video Player Component
const SimpleVideoPlayer = ({ url, fileName, isTorrent = false }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  // 🎯 COMBINED: Auto-play + cleanup in one useEffect
  useEffect(() => {
    // Auto-play when player is ready
    if (player) {
      player.play();    }

    // Cleanup function for blob URLs
    return () => {
      if (isTorrent && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    };
  }, [player, url, isTorrent]); // ✅ All dependencies together

  return (
    <TouchableOpacity
      style={styles.videoContainer}
      onPress={() => player.play()}
    >
      <VideoView
        player={player}
        style={styles.videoPlayer}
        showsControls={true}
        contentFit="contain"
        allowsExternalPlayback={true}
      />
      {fileName && (
        <Text style={styles.videoCaption} numberOfLines={1}>
          {fileName} {isTorrent && "🔗"}
        </Text>
      )}
    </TouchableOpacity>
  );
};

function ChatMediaRenderer({ message }) {
  // 1️⃣ Unconditionally filter out individual video chunk messages.
  // These are data for the player, not something to be displayed in the chat.
  if (message.fileType === "video_chunk") {
    return null;
  }

  const {
    imageUrl,
    videoUrl,
    fileUrl,
    magnetLink,
    fileName,
    fileType,
    thumbnailUrl,
  } = message;

  if (!message) return null;

  const [showVideoPlayer, setShowVideoPlayer] = useState(false);

  // 🆕 NEW: State for WebTorrent stream playback
  const [torrentStreamUrl, setTorrentStreamUrl] = useState(null);
  const [isLoadingTorrent, setIsLoadingTorrent] = useState(false);
  const [isDownloadingChunks, setIsDownloadingChunks] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState(null);

  // 🆕 Handle chunked video playback
  const handleChunkedVideo = async (sessionId, totalChunks) => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "Chunked videos require web browser");
      return;
    }

    setIsDownloadingChunks(true);

    try {
      // 1. Get all chunk messages for this session
      const chunkMessages = await fetchChunksBySession(sessionId);

      if (chunkMessages.length === 0) {
        Alert.alert("No Chunks", "Video chunks not found in chat");
        return;
      }

      // 2. Initialize reassembler
      const reassembler = new NeighborhoodVideoReassembler();
      reassembler.onChunkDownload = (downloaded, total) => {
        setDownloadProgress(Math.round((downloaded / total) * 100));
      };

      // 3. Start progressive download
      const blob = await reassembler.watchProgressive(
        chunkMessages,
        (downloaded, total) => {
          setDownloadProgress(Math.round((downloaded / total) * 100));
        }
      );

      // 4. Create URL and play
      const videoUrl = URL.createObjectURL(blob);
      setChunkedVideoUrl(videoUrl);
    } catch (error) {
      console.error("❌ Chunked video error:", error);
      Alert.alert("Playback Error", error.message);
    } finally {
      setIsDownloadingChunks(false);
    }
  };

  const handleMagnetPlay = async (magnetUri) => {
    if (Platform.OS !== "web") return;
    setIsLoadingTorrent(true);

    try {
      // 🔁 Use global client — create if missing (and attach!)
      let client = window.globalWebTorrentClient;
      if (!client) {
        console.warn("🔧 Creating global WebTorrent client on-demand");
        client = new window.WebTorrent();
        window.globalWebTorrentClient = client; // critical!
      }


      // 🔍 Check if already added (avoid duplicate adds)
      const existing = client.get(magnetUri);
      if (existing) {
        const file = existing.files.find(
          (f) => f.name.endsWith(".webm") || f.name.endsWith(".mp4")
        );
        if (file) {
          createVideoPlayer(file, existing);
          setIsLoadingTorrent(false);
          return;
        }
      }

      // ➕ Add torrent (USE CALLBACK — NOT PROMISE)
      client.add(magnetUri, { live: true }, (torrent) => {


        torrent.on("error", (err) => {
          console.error("❌ Torrent error:", err);
          Alert.alert("Stream Error", err.message);
          setIsLoadingTorrent(false);
        });

        // Wait until metadata is ready
        if (!torrent.ready) {
          torrent.once("ready", () => readyHandler(torrent));
        } else {
          readyHandler(torrent);
        }
      });
    } catch (err) {
      console.error("💥 handleMagnetPlay error:", err);
      Alert.alert("Playback Failed", err.message);
      setIsLoadingTorrent(false);
    }

    function readyHandler(torrent) {
      const file = torrent.files.find(
        (f) => f.name.endsWith(".webm") || f.name.endsWith(".mp4")
      );

      if (!file) {
        Alert.alert("❌ No video", "No .webm/.mp4 file in torrent");
        setIsLoadingTorrent(false);
        return;
      }

      createVideoPlayer(file, torrent);
      setIsLoadingTorrent(false);
    }
  };

  // 🎯 UPDATED: Robust video player with multiple fallback methods
  const createVideoPlayer = (file, torrent) => {

    // Only continue with MediaSource for desktop browsers
    // Create UI container
    const container = document.createElement("div");
    container.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.95); z-index: 9998;
    display: flex; flex-direction: column; 
    align-items: center; justify-content: center;
    padding: 20px;
  `;

    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.style.cssText = `
    width: 100%; max-width: 800px; max-height: 80vh;
    background: black; border: 2px solid #00ff00;
    border-radius: 8px;
  `;

    const statusDiv = document.createElement("div");
    statusDiv.style.cssText = `
    color: white; margin-top: 20px; text-align: center;
    font-family: monospace; font-size: 14px;
  `;

    const updateStatus = (msg) => {
      statusDiv.textContent = `🔄 ${msg}`;    };

    container.appendChild(video);
    container.appendChild(statusDiv);

    // 🎯 METHOD 1: Try direct blob URL first (simplest)
    updateStatus("Method 1: Creating blob URL...");
    file.getBlobURL((err, blobUrl) => {
      if (!err && blobUrl) {
        video.src = blobUrl;
        updateStatus("✅ Playing via blob URL");
        return;
      }

      console.warn("❌ Blob URL failed:", err?.message);
      updateStatus("Method 2: Creating read stream...");

      // 🎯 METHOD 2: MediaSource API (Desktop only)
      try {
        function getMediaSource() {
          return self.ManagedMediaSource || self.MediaSource;
        }

        const mediaSource = getMediaSource();
        video.src = URL.createObjectURL(mediaSource);
        video.disableRemotePlayback = true;

        mediaSource.addEventListener("sourceopen", () => {
          updateStatus("Creating stream source...");

          try {
            // 1. Create SourceBuffer with the correct MIME type
            const mimeType = 'video/webm; codecs="vp8,opus"'; // Match your WebTorrent files
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);

            // 2. Create a readable stream from the WebTorrent file
            const stream = file.createReadStream();
            let isBuffering = false;
            const bufferQueue = [];

            updateStatus("Starting stream...");

            // 3. When data arrives from WebTorrent, add it to the queue
            stream.on("data", (chunk) => {
              bufferQueue.push(chunk);
              processBuffer();
            });

            // 4. Handle stream end
            stream.on("end", () => {              if (!isBuffering && bufferQueue.length === 0) {
                mediaSource.endOfStream();
                updateStatus("✅ Stream complete");
              }
            });

            // 5. Process the buffer queue
            function processBuffer() {
              if (isBuffering || bufferQueue.length === 0) return;

              if (sourceBuffer.updating) {
                // SourceBuffer is busy, try again later
                setTimeout(processBuffer, 50);
                return;
              }

              isBuffering = true;
              const chunk = bufferQueue.shift();

              try {
                sourceBuffer.appendBuffer(chunk);
              } catch (err) {
                console.error("❌ Buffer append error:", err);
                // Handle MIME type fallback if needed
                if (err.name === "NotSupportedError") {
                  updateStatus("Trying MP4 fallback...");
                  try {
                    mediaSource.removeSourceBuffer(sourceBuffer);
                    const altMime = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"';
                    const newBuffer = mediaSource.addSourceBuffer(altMime);
                    newBuffer.appendBuffer(chunk);
                  } catch (altErr) {
                    console.error("Alt codec failed:", altErr);
                    fallbackToDownload();
                  }
                }
              }
            }

            // 6. When a buffer append is complete, process next chunk
            sourceBuffer.addEventListener("updateend", () => {
              isBuffering = false;
              processBuffer();

              // Auto-play when we have enough data
              if (video.paused && mediaSource.readyState === "open") {
                video
                  .play()
                  .catch((e) => console.warn("Auto-play blocked:", e));
              }
            });

            sourceBuffer.addEventListener("error", (e) => {
              console.error("SourceBuffer error:", e);
              updateStatus("Buffer error, trying fallback...");
              fallbackToDownload();
            });
          } catch (error) {
            console.error("❌ Source setup failed:", error);
            updateStatus(`Error: ${error.message}`);
            fallbackToDownload();
          }
        });
      } catch (streamErr) {
        console.error("Stream creation failed:", streamErr);
        fallbackToDownload();
      }
    });

    // 🎯 METHOD 3: Fallback - Direct download link
    function fallbackToDownload() {
      updateStatus("Creating direct download...");

      file.getBlob((err, blob) => {
        if (err) {
          console.error("Blob creation failed:", err);
          video.innerHTML = `
          <div style="color: white; padding: 40px; text-align: center;">
            <h3>❌ Playback Failed</h3>
            <p>${err.message || "Unknown error"}</p>
            <p>Torrent: ${torrent.name}</p>
            <p>Peers: ${torrent.numPeers}</p>
            <p>Progress: ${(torrent.progress * 100).toFixed(1)}%</p>
          </div>
        `;
          return;
        }

        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = file.name;
        downloadLink.textContent = `📥 Download ${file.name} (${(
          blob.size /
          1024 /
          1024
        ).toFixed(2)} MB)`;
        downloadLink.style.cssText = `
        display: inline-block; background: #0066cc;
        color: white; padding: 12px 24px; border-radius: 6px;
        text-decoration: none; margin-top: 20px; font-weight: bold;
      `;

        video.style.display = "none";
        container.appendChild(downloadLink);
        updateStatus("✅ Ready for download");
      });
    }

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ CLOSE PLAYER";
    closeBtn.style.cssText = `
    position: fixed; top: 20px; right: 20px;
    background: #ff4444; color: white; border: none;
    padding: 10px 20px; border-radius: 6px;
    font-weight: bold; cursor: pointer; z-index: 10000;
  `;
    closeBtn.onclick = () => {
      document.body.removeChild(container);
      document.body.removeChild(closeBtn);
    };

    document.body.appendChild(container);
    document.body.appendChild(closeBtn);
  };

  // 🆕 Helper to fetch chunks (you'll need to implement this)
  const fetchChunksBySession = async (sessionId) => {
    // This depends on your backend - you might need to:
    // 1. Filter messages in frontend from existing data
    // 2. Query backend for chunk messages
    // For now, let's assume we filter from existing messages
    // You'll need access to all messages - might need to pass as prop
    // or use a context/global state
    return []; // Placeholder
  };

  // 2️⃣ Handle video_chunk (INDIVIDUAL CHUNK MESSAGE)
  if (message.fileType === "video_chunk") {
    return null; // Don't render anything for individual chunks
  }

  // 🆕 Render chunked video
  if (message.fileType === "video_chunked") {
    // Master message with thumbnail
    if (chunkedVideoUrl) {
      // Show player
      return (
        <SimpleVideoPlayer url={chunkedVideoUrl} fileName={message.fileName} />
      );
    }

    return (
      <TouchableOpacity
        onPress={() =>
          handleChunkedVideo(message.sessionId, message.totalChunks)
        }
        style={styles.chunkedVideoContainer}
        disabled={isDownloadingChunks}
      >
        {message.thumbnailUrl ? (
          <Image
            source={{ uri: message.thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎬</Text>
          </View>
        )}

        <View style={styles.videoOverlay}>
          {isDownloadingChunks ? (
            <View style={styles.downloadProgress}>
              <ActivityIndicator size="large" color="#00ffff" />
              <Text style={styles.progressText}>{downloadProgress}%</Text>
            </View>
          ) : (
            <View style={styles.chunkPlayButton}>
              <Text style={styles.playIcon}>▶</Text>
              <Text style={styles.chunkCount}>{message.totalChunks} parts</Text>
            </View>
          )}
        </View>

        {message.fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {message.fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  const hasAnyMedia = imageUrl || videoUrl || fileUrl || magnetLink;
  if (!hasAnyMedia) {
    return null;
  }

  const getPinataUrl = (url) => {
    if (!url) return null;
    if (url.includes("/ipfs/")) {
      const cid = url.split("/ipfs/")[1];
      return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }
    return url;
  };

  // --- VIDEO LOGIC ---
  if (videoUrl) {
    const pinataUrl = getPinataUrl(videoUrl);

    if (showVideoPlayer) {
      return (
        <SimpleVideoPlayer url={pinataUrl} fileName={fileName || "Video"} />
      );
    }

    return (
      <TouchableOpacity
        onPress={() => setShowVideoPlayer(true)}
        style={styles.videoThumbnailContainer}
      >
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.videoThumbnail}
          resizeMode="cover"
        />
        <View style={styles.videoOverlay}>
          <Text style={styles.playIcon}>▶️</Text>
        </View>
        {fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // 🆕 NEW: Handle magnet links (for streams)
  if (magnetLink && fileType === "video") {
    // If we have a torrent stream URL ready, show the player
    if (torrentStreamUrl) {
      return (
        <SimpleVideoPlayer
          url={torrentStreamUrl}
          fileName={fileName || "Live Stream"}
        />
      );
    }

    // Otherwise show thumbnail with play button
    return (
      <TouchableOpacity
        onPress={() => handleMagnetPlay(magnetLink)}
        style={styles.videoThumbnailContainer}
        disabled={isLoadingTorrent}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.streamPlaceholder]}>
            <Text style={styles.streamIcon}>🎥</Text>
            <Text style={styles.streamText}>LIVE STREAM</Text>
          </View>
        )}

        <View style={styles.videoOverlay}>
          {isLoadingTorrent ? (
            <ActivityIndicator size="large" color="#00ffff" />
          ) : (
            <View style={styles.streamPlayButton}>
              <Text style={styles.streamPlayIcon}>▶</Text>
            </View>
          )}
        </View>

        {fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // 1. If it has magnet link → WebTorrentMedia (handles both images and videos)
  if (magnetLink && (fileType === "image" || fileType === "video")) {
    return (
      <View style={styles.magnetContainer}>
        <WebTorrentMedia media={message} isFocused={true} />
      </View>
    );
  }

  // 2. If it's an image → Direct image
  if (imageUrl || fileType === "image") {
    const pinataUrl = getPinataUrl(imageUrl);
    return (
      <TouchableOpacity onPress={() => console.log("Open image:", pinataUrl)}>
        <Image
          source={{ uri: pinataUrl }}
          style={styles.messageImage}
          resizeMode="cover"
        />
        {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
      </TouchableOpacity>
    );
  }

  // 4. If it's a file → File download
  if (fileUrl) {
    const pinataUrl = getPinataUrl(fileUrl);
    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() => handleFilePress({ ...message, fileUrl: pinataUrl })}
      >
        <Text style={styles.fileIcon}>📄</Text>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || "File"}
          </Text>
          <Text style={styles.fileType}>
            {fileType || "File"} • Tap to download
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  // 5. Fallback for edge cases (should rarely happen)
  return (
    <View style={styles.fileContainer}>
      <Text style={styles.fileIcon}>❓</Text>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || "Media"}
        </Text>
        <Text style={styles.fileType}>Cannot preview • Tap for info</Text>
      </View>
    </View>
  );
}

// GraphQL Queries
const GET_NEIGHBORHOOD_MESSAGES = gql`
  query GetNeighborhoodMessages($neighborhoodId: ID!) {
    neighborhoodMessages(neighborhoodId: $neighborhoodId) {
      id
      content
      room
      createdAt
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      thumbnailUrl
      sessionId
      chunkIndex
      magnetLink
      sender {
        id
        username
        profilePhoto
      }
    }
  }
`;

const GET_NEIGHBORHOOD_INFO = gql`
  query GetNeighborhood($id: ID!) {
    neighborhood(id: $id) {
      id
      name
      type
      owner {
        username
      }
      members {
        user {
          id
          username
          profilePhoto
        }
        role
        joinedAt
      }
      createdAt
      description
    }
  }
`;

const SEND_NEIGHBORHOOD_MESSAGE = gql`
  mutation SendNeighborhoodMessage(
    $content: String!
    $neighborhoodId: ID!
    $fileName: String
    $fileType: String
    $imageUrl: String
    $videoUrl: String
    $fileUrl: String
    $magnetLink: String
    $mimeType: String
    $thumbnailUrl: String
    $sessionId: String
    $chunkIndex: Int
    $totalChunks: Int
  ) {
    sendMessage(
      content: $content
      neighborhoodId: $neighborhoodId
      room: "neighborhood"
      fileName: $fileName
      fileType: $fileType
      imageUrl: $imageUrl
      videoUrl: $videoUrl
      fileUrl: $fileUrl
      magnetLink: $magnetLink
      mimeType: $mimeType
      sessionId: $sessionId
      chunkIndex: $chunkIndex
      totalChunks: $totalChunks
      thumbnailUrl: $thumbnailUrl
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      sessionId
      chunkIndex
      totalChunks
      fileType
      magnetLink
      mimeType
      thumbnailUrl # 🆕 ADD THIS LINE
      room
      createdAt
      sender {
        id
        username
        profilePhoto
      }
    }
  }
`;

const GET_RANDOM_AFFILIATE_LINK = gql`
  query GetRandomAffiliateLink {
    randomAffiliateLink {
      id
      url
      title
      imageUrl
      description
      clicks
    }
  }
`;

const DELETE_NEIGHBORHOOD_MESSAGE = gql`
  mutation DeleteNeighborhoodMessage($messageId: ID!) {
    deleteMessage(messageId: $messageId)
  }
`;

const GET_MY_VIDEOS = gql`
  query GetMyVideos {
    getMyVideos {
      id
      title
      description
      fileName
      fileSize
      fileType
      cid
      ipfsUrl
      magnetLink
      user {
        id
        username
        profilePhoto
      }
      neighborhood {
        id
        name
        description
      }
      createdAt
    }
  }
`;

const GET_ALL_IMAGES = gql`
  query GetAllImages {
    images {
      id
      title
      description
      fileName
      fileSize
      fileType
      mimetype
      cid
      ipfsUrl
      magnetLink
      user {
        id
        username
        profilePhoto
      }
      neighborhood {
        id
        name
        description
      }
      createdAt
    }
  }
`;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Utility Functions
const formatTimestamp = (timestamp) => {
  try {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Now";
  }
};

const getProfilePhotoUrl = (profilePhoto) => {
  if (!profilePhoto) {
    return "https://via.placeholder.com/40";
  }

  // If it's already a full URL (http:// or https://), use it directly
  if (profilePhoto.startsWith("http")) {
    return profilePhoto;
  }

  // If it's a blob URL, use it directly (backward compatibility)
  if (profilePhoto.startsWith("blob:")) {
    return profilePhoto;
  }

  // If it's an IPFS CID (starts with Qm or bafy), construct the IPFS URL
  if (profilePhoto.startsWith("Qm") || profilePhoto.startsWith("baf")) {
    return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
  }

  // If it's just a string that doesn't match above, assume it's a CID
  return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
};

const handleFilePress = async (message) => {
  try {
    if (!message.fileUrl) {
      Alert.alert("Error", "No file URL available");
      return;
    }

    // Create a proper IPFS URL
    const ipfsUrl = message.fileUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);



    // For web - use direct download
    if (Platform.OS === "web") {
      // Create a temporary download link
      const link = document.createElement("a");
      link.href = ipfsUrl;
      link.download = message.fileName || "download";
      link.target = "_blank";

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Alert.alert(
        "Download Started",
        `${message.fileName || "File"} download started in new tab.`
      );
    } else {
      // For mobile - show options
      Alert.alert(message.fileName || "File", "What would you like to do?", [
        {
          text: "Open in Browser",
          onPress: () =>
            Linking.openURL(ipfsUrl).catch((err) => {
              console.error("Open URL error:", err);
              Alert.alert("Error", "Could not open file");
            }),
        },
        {
          text: "Copy Link",
          onPress: async () => {
            try {
              // For React Native, you might need a clipboard library
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(ipfsUrl);
                Alert.alert("Success", "Link copied to clipboard!");
              } else {
                // Fallback for older browsers
                const textArea = document.createElement("textarea");
                textArea.value = ipfsUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
                Alert.alert("Success", "Link copied to clipboard!");
              }
            } catch (err) {
              Alert.alert("Error", "Could not copy link");
            }
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]);
    }
  } catch (error) {
    console.error("File press error:", error);
    Alert.alert("Error", "Failed to handle file: " + error.message);
  }
};

export default function NeighborhoodChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const neighborhoodId = params.neighborhoodId;

  const scrollViewRef = useRef(null);
  const messageInputRef = useRef(null);
  const socketRef = useRef(null);
  const [deleteMessageMutation] = useMutation(DELETE_NEIGHBORHOOD_MESSAGE);
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null);
  const [messageCount, setMessageCount] = useState(0);

  const { data: adData, refetch: fetchRandomAd } = useQuery(
    GET_RANDOM_AFFILIATE_LINK,
    {
      skip: !isAuthenticated, // Only run once authentication is confirmed
    }
  );

  const TRACK_CLICK = gql`
    mutation TrackAffiliateClick($id: ID!) {
      trackAffiliateClick(id: $id)
    }
  `;

  const [trackClick] = useMutation(TRACK_CLICK);

  const handleDeleteMessage = async (messageId) => {

    // 🔑 NEW: Use a standard browser confirm for Web, Alert for native
    const shouldProceed = await new Promise((resolve) => {
      if (Platform.OS === "web") {
        // Use browser's built-in confirm dialog (synchronous)
        const proceed = window.confirm(
          "Are you sure you want to permanently delete this message?"
        );
        resolve(proceed);
      } else {
        // Use React Native Alert (for iOS/Android)
        Alert.alert(
          "Delete Message",
          "Are you sure you want to permanently delete this message?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ]
        );
      }
    });

    if (!shouldProceed) {
      return; // Stop execution if the user cancels
    }

    // --- Deletion Logic Starts Here ---

    try {
      await deleteMessageMutation({
        variables: { messageId },
        update(cache) {
          // ... cache modification logic ...
          cache.modify({
            fields: {
              neighborhoodMessages(existingMessageRefs = [], { readField }) {
                return existingMessageRefs.filter(
                  (messageRef) => readField("id", messageRef) !== messageId
                );
              },
            },
          });
        },
      });
    } catch (error) {
      console.error("❌ Deletion error:", error);

      let errorMessage = "Failed to delete message due to an unknown error.";
      if (error.graphQLErrors && error.graphQLErrors.length > 0) {
        errorMessage = error.graphQLErrors[0].message;
      } else if (error.networkError) {
        errorMessage = `Network Error: ${error.networkError.message}`;
      } else {
        errorMessage = error.message;
      }

      Alert.alert(
        "Deletion Failed",
        errorMessage.replace("GraphQL error: ", "")
      );
    }
  };

  // GraphQL Queries
  const { data: neighborhoodData, loading: neighborhoodLoading } = useQuery(
    GET_NEIGHBORHOOD_INFO,
    {
      variables: { id: neighborhoodId },
      skip: !neighborhoodId,
    }
  );

  const { loading, error, data, refetch } = useQuery(
    GET_NEIGHBORHOOD_MESSAGES,
    {
      variables: { neighborhoodId },
      fetchPolicy: "cache-and-network",
      skip: !isAuthenticated || !neighborhoodId,
    }
  );

  const [sendMessageMutation] = useMutation(SEND_NEIGHBORHOOD_MESSAGE);

  const isNeighborhoodAdmin = useMemo(() => {
    if (!username || !neighborhoodData?.neighborhood) return false;

    const neighborhood = neighborhoodData.neighborhood;
    const isOwner = neighborhood.owner?.username === username;

    const member = neighborhood.members?.find(
      (m) => m.user?.username === username
    );
    const isAdmin = member?.role === "admin";

    return isOwner || isAdmin;
  }, [neighborhoodData, username]);

  const renderMessage = (message) => (
    <View key={message.id}>
      <ChatMediaRenderer message={message} />
    </View>
  );

  useEffect(() => {
    // first ad on load
    fetchRandomAd();
  }, []);

  // Authentication Check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        if (!token) {
          Alert.alert(
            "Authentication Required",
            "Please log in to access chat"
          );
          router.replace("/login");
          return;
        }

        setUsername(savedUsername || "");
        setIsAuthenticated(true);
        initializeSocket(token);
      } catch (error) {
        console.error("Auth check error:", error);
        Alert.alert("Error", "Failed to initialize chat");
      }
    };

    checkAuth();

    return () => {
      socket?.disconnect();
      // 🛑 Only clean up LIVE streams — don't destroy all torrents!
      if (Platform.OS === "web" && window.globalWebTorrentClient) {
        const client = window.globalWebTorrentClient;
        client.torrents.forEach((torrent) => {
          if (
            torrent.name?.includes("live-") ||
            torrent.name?.includes("clip_")
          ) {
            torrent.destroy();
          }
        });
      }
    };
  }, [neighborhoodId]);

  const showRandomAd = async () => {
    try {
      const result = await fetchRandomAd();

      if (result.data?.randomAffiliateLink) {
        setCurrentAd(result.data.randomAffiliateLink);
        setShowAd(true);

        // Auto-hide after 30 seconds
        setTimeout(() => {
          setShowAd(false);
        }, 30000);
      }
    } catch (error) {
      console.error("❌ Failed to fetch ad:", error);
    }
  };

  const initializeSocket = (token) => {

const newSocket = io(BACKEND_URL, {
  auth: { token },
  path: "/socket.io-chat/",
  transports: ["polling"], // force polling
});

    newSocket.on("connect", () => {
      refetch(); 
      setSocket(newSocket);
      newSocket.emit("join-neighborhood", neighborhoodId);
    });

    newSocket.on("connect_error", (err) => {
      console.error("❌ Neighborhood socket connection error:", err);
    });

    newSocket.on("message", (newMsg) => {
      refetch();
    });

    setSocket(newSocket);
  };

  const takeCameraMedia = async () => {
    setUploading(true);
    setUploadType("camera");
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Camera access required.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaType.All, // photo + video
        quality: 0.8,
      });

      if (result.canceled) return; // user hit cancel

      const asset = result.assets[0];
      const type = asset.type === "image" ? "image" : "video";

      // same fallback chain as pickFile
      const fileName =
        asset.fileName ||
        asset.uri.split("/").pop() ||
        `${type}-${Date.now()}.${type === "image" ? "jpg" : "mp4"}`;

      // identical call signature to unifiedUpload in pickFile
      await unifiedUpload({ uri: asset.uri, name: fileName }, type, 0, "");
    } catch (error) {
      console.error("Camera capture error:", error);
      Alert.alert("Error", "Failed to capture media");
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  // open camera
  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const type = asset.type === "image" ? "image" : "video";

      await unifiedUpload(
        {
          uri: asset.uri,
          name: asset.fileName || asset.uri.split("/").pop() || "camera-media",
        },
        type,
        0,
        ""
      );
    }
  };

  // Send Message
  const sendMessage = async () => {
    if (!newMessage.trim() || !socket) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      await sendMessageMutation({
        variables: {
          content: messageContent,
          neighborhoodId: neighborhoodId,
        },
      });

      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    } catch (err) {
      console.error("❌ Send message error:", err);
      Alert.alert("Error", "Failed to send message");
      setNewMessage(messageContent);
    }
  };

  // In pickImage function
  const pickFile = async () => {
    // 🔑 Use DocumentPicker for general files (and files the user manually selects)
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*", // Allow all types
    });

    if (!result.canceled) {
      const file = result.assets[0];
      const type = getFileType(file.name || file.fileName); // Determine type

      // 🎯 FIX 3: Don't default to 'video'. Use the determined type.

      if (
        type === "video" && // ONLY check for large video chunking
        file.size > 10 * 1024 * 1024 &&
        Platform.OS === "web"
      ) {
        // Ask user only for large videos
        Alert.alert(
          "Large Video",
          "Upload as chunked P2P video (faster for neighbors)?",
          [
            {
              text: "Regular Upload",
              onPress: () =>
                unifiedUpload(file, type, file.size, file.mimeType),
            },
            { text: "Chunked P2P", onPress: () => uploadChunkedVideo(file) },
          ]
        );
      } else {
        // For all images, documents, and small videos, use regular upload
        unifiedUpload(file, type, file.size, file.mimeType);
      }
    }
  };

  // SIMPLE Upload - JUST STORE WHAT WE GET
  const unifiedUpload = async (asset, type, fileSize, mimeType) => {
    setUploading(true);
    setUploadType(type);

    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // 🆕 NEW LOGIC: Use chunking for videos > 5MB on web
      if (
        type === "video" &&
        Platform.OS === "web" &&
        fileSize > 5 * 1024 * 1024
      ) {
        await uploadChunkedVideo(asset);
        return;
      }
      let fileUri = asset.uri;
      let fileName = asset.name || asset.fileName || `file-${Date.now()}`;


      // Upload to IPFS WITH THUMBNAIL
      const { ipfsUrl, magnetLink, thumbnailUrl } = await uploadToIPFS(
        fileUri,
        fileName,
        type,
        token,
        neighborhoodId
      );
      console.log("🎯 Received from uploadToIPFS:", {
        thumbnailUrl,
        hasThumbnail: !!thumbnailUrl,
      });

      if (ipfsUrl) {
        // Include thumbnailUrl in message variables
        const messageVariables = {
          content: `Shared: ${fileName}`,
          neighborhoodId: neighborhoodId,
          fileName,
          fileType: type,
          magnetLink: magnetLink || null,
          thumbnailUrl: thumbnailUrl || null, // 🆕 Add thumbnail URL
        };

        // Store in appropriate field
        if (type === "image") {
          messageVariables.imageUrl = ipfsUrl;
        } else if (type === "video") {
          messageVariables.videoUrl = ipfsUrl;
        } else {
          messageVariables.fileUrl = ipfsUrl;
        }

        await sendMessageMutation({
          variables: messageVariables,
          refetchQueries: [
            { query: GET_ALL_IMAGES }, // Assuming this is used by the gallery
            { query: GET_MY_VIDEOS }, // Assuming this is used by the gallery
            // If your gallery uses a combined query, list that too
          ],
        });
      }
    } catch (error) {
      console.error(`❌ Upload error:`, error);
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  const uploadChunkedVideo = async (asset) => {

    const response = await fetch(asset.uri);

    const arrayBuffer = await response.arrayBuffer();
    const originalBlob = new Blob({ arrayBuffer, type: "video/mp4" });

    // Parameters
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (adjustable)
    const totalChunks = Math.ceil(originalBlob.size / CHUNK_SIZE);
    const sessionId = `video_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;


    // Generate thumbnail
    let thumbnailUrl = null;
    try {
      const { base64 } = await generateThumbnail(asset.uri);
      thumbnailUrl = base64;
    } catch (e) {
    }

    // 🎯 FIRST: Send the "master" message with thumbnail
    await sendMessageMutation({
      variables: {
        content: `🎬 Neighborhood Video (${totalChunks} parts)`,
        neighborhoodId: neighborhoodId,
        fileName: asset.name || "neighborhood-video.mp4",
        fileType: "video_chunked",
        sessionId: sessionId,
        totalChunks: totalChunks,
        thumbnailUrl: thumbnailUrl,
        // These stay null for chunked videos
        imageUrl: null,
        videoUrl: null,
        fileUrl: null,
        magnetLink: null,
      },
    });

    // 🎯 SECOND: Upload chunks in sequence (not parallel to avoid overload)
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, originalBlob.size);
      const chunk = originalBlob.slice(start, end, "video/mp4");

      await uploadSingleChunk(chunk, i, sessionId, totalChunks, asset.name);

      // Small delay between chunks
      if (i < totalChunks - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return true;
  };

  // In NeighborhoodChatScreen.js

  const uploadSingleChunk = (
    chunk,
    index,
    sessionId,
    totalChunks,
    fileName
  ) => {
    return new Promise((resolve, reject) => {
      const client = window.globalWebTorrentClient;
      if (!client) {
        console.error(
          "❌ Global WebTorrent client not found. Cannot seed chunk."
        );
        // Reject the promise so the chunk process doesn't hang
        return reject(new Error("WebTorrent client not initialized."));
      }

      client.seed(
        chunk,
        {
          // Ensure the torrent name is unique and easy to identify/destroy
          name: `${sessionId}_chunk_${index}`,
        },
        (torrent) => {
          console.log(
            `✅ Chunk ${
              index + 1
            }/${totalChunks} seeded. Magnet URI generated.`,
            {
              index: index, // Use the correct variable name 'index'
              magnet: torrent.magnetURI,
              size: chunk.size,
            }
          );

          // Send chunk message to chat via GraphQL mutation
          sendMessageMutation({
            variables: {
              content: `Part ${index + 1}/${totalChunks} of "${fileName}"`,
              neighborhoodId: neighborhoodId,
              fileName: `chunk_${index}.mp4`,
              fileType: "video_chunk",
              magnetLink: torrent.magnetURI,

              // 🔑 CRITICAL DATA FOR PLAYER REASSEMBLY:
              chunkIndex: index,
              sessionId: sessionId,
              totalChunks: totalChunks,

              // Ensure these are null for chunks
              imageUrl: null,
              videoUrl: null,
              fileUrl: null,
              thumbnailUrl: null,
            },
          })
            .then(() => {
              // Resolve the promise, allowing the next chunk to process
              resolve();
            })
            .catch((err) => {
              console.error("❌ Error sending chunk message:", err);
              reject(err);
            });
        }
      );
    });
  };

  const uploadChunk = async (chunk, index, sessionId, totalChunks) => {
    // Create torrent for this chunk
    if (!window.WebTorrent) {
      // Load WebTorrent...
    }

    const client = new window.WebTorrent();

    return new Promise((resolve) => {
      client.seed(
        chunk,
        {
          name: `neighborhood-video-${sessionId}-chunk-${index}`,
          announce: ["wss://tracker.openwebtorrent.com"],
        },
        (torrent) => {
          // Send chunk to chat
          sendMessageMutation({
            variables: {
              content: `Video chunk ${index + 1}/${totalChunks}`,
              neighborhoodId: neighborhoodId,
              fileName: `chunk-${index}.mp4`,
              fileType: "video_chunk", // New type!
              magnetLink: torrent.magnetURI,
              chunkIndex: index,
              sessionId: sessionId,
              totalChunks: totalChunks,
            },
          });
          resolve();
        }
      );
    });
  };

  // Helper function
  const getMimeType = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    const mimeTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      heic: "image/heic",
      mp4: "video/mp4",
      mov: "video/quicktime",
    };
    return mimeTypes[ext] || "application/octet-stream";
  };

  // Helper function for MIME types
  const getMimeTypeFromExtension = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    const mimeTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      heic: "image/heic",
      bmp: "image/bmp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
    };
    return mimeTypes[ext] || "application/octet-stream";
  };

  const generateThumbnail = async (videoUrl) => {

    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.currentTime = 2;
      video.muted = true;

      video.onloadeddata = async () => {

        try {
          const originalWidth = video.videoWidth;
          const originalHeight = video.videoHeight;
          const targetWidth = 320;
          const targetHeight = (originalHeight / originalWidth) * targetWidth;
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");

          ctx.drawImage(video, 0, 0, 320, 240);

          // 🎯 FIX: Use the reliable toDataURL() instead of convertToBlob()
          // We convert directly to a base64 JPEG, which is widely supported.
          const base64 = canvas.toDataURL("image/jpeg", 0.8); // 0.8 is quality

          // Optionally, you can log the size estimate, though not exact blob size
          const sizeEstimate = base64.length * (3 / 4) - 2;



          resolve({
            // We are returning a base64 string directly, no need for blob
            base64,
            format: "jpeg", // Update format
            size: sizeEstimate,
          });
        } catch (error) {
          console.error("❌ Canvas/Blob conversion failed:", error);
          reject(error);
        }
      };

      video.onerror = (e) => {
        console.error("❌ Video load failed:", e);
        reject(new Error(`Video load error: ${e.message}`));
      };

      // Set timeout
      setTimeout(() => {
        if (video.readyState < 2) {
          reject(new Error("Video load timeout (10s)"));
        }
      }, 10000);

      video.load();
    });
  };

  const uploadToIPFS = async (
    fileUri,
    fileName,
    type,
    token,
    neighborhoodId
  ) => {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("video", blob, fileName);
      formData.append("title", fileName);
      formData.append("description", `Uploaded ${type} - ${fileName}`);

      if (neighborhoodId) {
        formData.append("neighborhoodId", neighborhoodId);
      }

      console.log("📤 IPFS Upload:", {
        fileName,
        type,
        size: blob.size,
        neighborhoodId,
      });

      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      console.log("📥 upload response status:", res.status);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`IPFS upload failed: ${res.status} – ${errorText}`);
      }

      const result = await res.json();
      const { ipfsUrl, magnetLink } = result;

      console.log("✅ IPFS Result:", { ipfsUrl, magnetLink });

      // 🎯 AVIF THUMBNAIL GENERATION// In uploadToIPFS function:
      let thumbnailUrl = null;

      if (type === "video") {
        try {
          console.log("🎬 Starting thumbnail generation for video...");

          const { base64, format, size } = await generateThumbnail(fileUri);

          console.log(
            `✅ ${format.toUpperCase()} thumbnail generated: ${size} bytes`
          );
          thumbnailUrl = base64;
        } catch (thumbnailError) {
          console.error(
            "❌ Thumbnail generation failed completely:",
            thumbnailError.message
          );
          // Continue without thumbnail
        }
      }

      console.log("📊 Final return values:", {
        ipfsUrl,
        magnetLink,
        thumbnailUrl,
        hasThumbnail: !!thumbnailUrl,
      });

      // ✅ Always return from here (for all file types)
      return {
        ipfsUrl,
        magnetLink,
        thumbnailUrl,
      };
    } catch (error) {
      console.error("❌ IPFS upload error:", error);
      throw error;
    }
  };

  const messages = data?.neighborhoodMessages || [];

  const neighborhoodName =
    neighborhoodData?.neighborhood?.name || "Neighborhood";

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Loading neighborhood chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading chat</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/neighborhood-gallery?neighborhoodId=${neighborhoodId}`
            )
          }
          style={styles.galleryButton}
        >
          <Text style={styles.galleryButtonText}> 🖼 Gallery</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() =>
            router.push(
              `/neighborhoods/invite-links?neighborhoodId=${neighborhoodId}`
            )
          }
          style={styles.galleryButton}
        >
          <Text style={styles.galleryButtonText}>📧 Invite</Text>
        </TouchableOpacity>

        <Text style={styles.roomTitle}>🏘️ {neighborhoodName}</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/neighborhood-members?neighborhoodId=${neighborhoodId}`
            )
          }
          style={styles.membersButton}
        >
          <Text style={styles.membersButtonText}>👥</Text>
        </TouchableOpacity>
      </View>
      {!socket && (
        <View style={styles.connectionWarning}>
          <Text style={styles.warningText}>Connecting...</Text>
        </View>
      )}
      <ScrollView style={styles.messagesList} ref={scrollViewRef}>
        {messages.map((item, index) => {
          // Check for ad placement
          const showAdHere = index % 20 === 0;

          return (
            <React.Fragment key={item.id}>
              {renderMessage(item)}

              {showAdHere && adData?.randomAffiliateLink && (
                <View style={styles.messageContainer}></View>
              )}
            </React.Fragment>
          );
        })}
      </ScrollView>
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.uploadButton} onPress={pickFile}>
          <Text style={styles.uploadButtonText}>📎</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uploadButton} onPress={openCamera}>
          <Text style={styles.uploadButtonText}>📷</Text>
        </TouchableOpacity>
      </View>
      <View>
        <TextInput
          ref={messageInputRef}
          style={[styles.messageInput, !socket && styles.messageInputDisabled]}
          placeholder={socket ? "Type a message..." : "Connecting..."}
          placeholderTextColor="#888"
          value={newMessage}
          onChangeText={setNewMessage}
          onSubmitEditing={sendMessage}
          editable={!!socket}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || !socket) && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || !socket}
        >
          <Text style={styles.sendButtonText}>Send</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  messageContent: {
    flexShrink: 1, // Allows content to wrap
    // Make sure this container holds the timestamp/delete button row nicely
  },

  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start", // Align timestamp and icon to the left
    marginTop: 4,
  },

  timestamp: {
    // Your existing timestamp style
    fontSize: 10,
    color: "#888",
    marginRight: 10, // Add space between timestamp and icon
  },

  deleteButton: {
    padding: 5,
    backgroundColor: "yellow", // ⬅️ TEST COLOR
    zIndex: 10, // ⬅️ Ensure it's on top
  },

  deleteIcon: {
    fontSize: 14, // Small icon size
    color: "red", // Clear visual cue for deletion
  },
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "#000000",
    padding: 5,
  },
  loadingText: {
    color: "#00ffff",
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  errorDetail: {
    color: "#FF8888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00ffff",
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  roomTitle: {
    fontSize: 18,
    color: "#00ffff",
    fontWeight: "bold",
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: "#00ffff",
  },
  connectionWarning: {
    backgroundColor: "#331100",
    padding: 8,
    alignItems: "center",
  },
  warningText: {
    fontSize: 12,
    color: "#FFAA00",
  },
  messagesList: {
    flex: 1,
  },
  messageContainer: {
    color: "#fff",
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#333333",
  },
  messageContent: {
    flex: 1,
  },
  username: {
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
    fontSize: 14,
  },
  messageText: {
    color: "#FFFFFF",
    marginBottom: 8,
    fontSize: 16,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: "#00AA00",
    opacity: 0.7,
  },
  // LARGER MEDIA STYLES
  messageImage: {
    width: "100%", // Will be controlled by parent
    maxWidth: "90%", // Maximum size on large screens
    height: undefined,
    aspectRatio: 4 / 3, // Maintain aspect ratio
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center", // Center the media
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333333",
    maxWidth: 600, // Limit file container width
    alignSelf: "center",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  fileType: {
    color: "#00AA00",
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#00ffff",
    backgroundColor: "#111111",
    alignItems: "center",
  },
  messageInput: {
    flex: 1,
    backgroundColor: "#000000",
    borderWidth: 2,
    borderColor: "#00ffff",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: "#00ffff",
    marginRight: 10,
    fontSize: 16,
  },
  messageInputDisabled: {
    borderColor: "#333333",
    color: "#666666",
  },
  sendButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#333333",
  },
  sendButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 16,
  },
  uploadButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: "#333333",
    borderRadius: 25,
    justifyContent: "center",
  },
  uploadButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },
  retryButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: "#000000",
    fontWeight: "bold",
  },
  membersButton: {
    padding: 8,
  },
  membersButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },

  // LARGER VIDEO PLAYER STYLES
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%", // Full width of message container
    maxWidth: 800, // Maximum size on large screens
    alignSelf: "center", // Center in message
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9, // Standard video aspect ratio
    backgroundColor: "#000",
  },
  videoCaption: {
    opacity: 0,
  },
  fileNameText: {
    opacity: 0,
  },
  adContainer: {
    backgroundColor: "#1a1a1a",
    borderLeftWidth: 4,
    borderLeftColor: "#00ffff",
    margin: 10,
    padding: 12,
    borderRadius: 8,
  },
  adHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  adBadge: {
    color: "#00ffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  adContent: {
    // Your ad content styles
  },
  adTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  adDescription: {
    color: "#cccccc",
    fontSize: 14,
    marginBottom: 8,
  },
  adButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  adButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 14,
  },
  adUrl: {
    color: "#888888",
    fontSize: 12,
    fontStyle: "italic",
  },
  galleryButtonText: {
    fontSize: 16,
    color: "#00ffff",
  },

  videoThumbnailContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoThumbnail: {
    minWidth: 200,
    minHeight: 900,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playIcon: {
    fontSize: 40,
  },
  videoFileName: {
    opacity: 0,
  },
  // Add to your StyleSheet:
  streamPlaceholder: {
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  streamIcon: {
    fontSize: 48,
    color: "#00ffff",
    marginBottom: 8,
  },
  streamText: {
    color: "#00ffff",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  streamPlayButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255, 0, 0, 0.8)", // Red for "live"
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  streamPlayIcon: {
    fontSize: 32,
    color: "#fff",
    marginLeft: 4,
  },
  chunkedVideoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  chunkPlayButton: {
    alignItems: "center",
  },
  chunkCount: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  downloadProgress: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 10,
    borderRadius: 20,
  },
  progressText: {
    color: "#00ffff",
    fontSize: 14,
    marginTop: 4,
  },
  chunkIndicator: {
    backgroundColor: "#1a1a1a",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  chunkText: {
    color: "#888",
    fontSize: 11,
  },
  inviteLinksButton: {
    backgroundColor: "#000000",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 10,
  },
  inviteLinksButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },

  liveStreamCard: {
    backgroundColor: "#ffeded",
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ff4444",
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ff4444",
    marginBottom: 4,
  },
  fileName: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  magnetLink: {
    fontSize: 13,
    color: "#0066cc",
    textDecorationLine: "underline",
    marginBottom: 8,
  },
  playButton: {
    backgroundColor: "#0066cc",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  playButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  // ... inside your styles object ...
  streamButton: {
    padding: 12,
    marginHorizontal: 5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1, // Allows the button to take up remaining space
  },
  startStreamButton: {
    backgroundColor: "#00AA00", // Green for Go Live
  },
  stopStreamButton: {
    backgroundColor: "#FF3333", // Red for Stop Live
  },
  streamButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
});
