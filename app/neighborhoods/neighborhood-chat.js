// app/neighborhood-chat.js
import React, { useState, useEffect, useRef } from "react";
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
  // 🎯 FIX: Return "video" for video extensions
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["pdf", "doc", "docx"].includes(ext)) return "document";
  // The logic in pickFile/unifiedUpload should handle images correctly
  // but if you want to explicitly check for them here:
  // if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
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
      player.play();
      console.log("🎬 SimpleVideoPlayer: Auto-playing video.");
    }

    // Cleanup function for blob URLs
    return () => {
      if (isTorrent && url.startsWith("blob:")) {
        console.log("🧹 Cleaning up blob URL:", url);
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
// Updated ChatMediaRenderer with stream support
const ChatMediaRenderer = ({ message }) => {
  const {
    imageUrl,
    videoUrl,
    fileUrl,
    magnetLink,
    fileName,
    fileType,
    thumbnailUrl,
  } = message;

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

  // 🆕 Render individual chunk (small indicator)
  if (message.fileType === "video_chunk") {
    return (
      <View style={styles.chunkIndicator}>
        <Text style={styles.chunkText}>
          🧩 Part {message.chunkIndex + 1}/{message.totalChunks}
        </Text>
      </View>
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

  // 🆕 NEW: Handle magnet link playback
  const handleMagnetPlay = async (magnetUri) => {
    if (Platform.OS !== "web") {
      Alert.alert(
        "Web Only",
        "P2P stream playback is available on web browsers only",
        [{ text: "OK" }]
      );
      return;
    }
    // Add this to handle LIVE magnet links
    const handleLiveStream = async (magnetUri) => {
      setIsLoadingTorrent(true);

      try {
        if (!window.WebTorrent) {
          const script = document.createElement("script");
          script.src =
            "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
          document.head.appendChild(script);
          await new Promise((resolve) => (script.onload = resolve));
        }

        const client = new window.WebTorrent();

        // 🎯 KEY: Add with live option
        client.add(magnetUri, { live: true }, (torrent) => {
          console.log("📥 Joining LIVE stream:", torrent.name);

          // Get video file
          const file = torrent.files.find(
            (f) => f.name.endsWith(".webm") || f.name.includes("live")
          );

          if (file) {
            // Create video element for playback
            const video = document.createElement("video");
            video.controls = true;
            video.autoplay = true;
            video.style.cssText = `
          position: fixed; top: 50%; left: 50%; 
          transform: translate(-50%, -50%);
          width: 80vw; max-width: 800px;
          z-index: 2000; background: black;
          border: 3px solid #ff0000;
        `;

            // Stream the file
            file.streamTo(video);

            // Add close button
            const closeBtn = document.createElement("button");
            closeBtn.textContent = "✕";
            closeBtn.style.cssText = `
          position: fixed; top: 20px; right: 20px;
          background: #ff0000; color: white;
          border: none; width: 40px; height: 40px;
          border-radius: 20px; font-size: 20px;
          z-index: 2001; cursor: pointer;
        `;
            closeBtn.onclick = () => {
              document.body.removeChild(video);
              document.body.removeChild(closeBtn);
              torrent.destroy();
            };

            document.body.appendChild(video);
            document.body.appendChild(closeBtn);

            setIsLoadingTorrent(false);
          }
        });
      } catch (error) {
        console.error("❌ Live stream join error:", error);
        Alert.alert("Stream Error", "Could not join live stream");
        setIsLoadingTorrent(false);
      }
    };

    setIsLoadingTorrent(true);

    try {
      // Load WebTorrent if needed
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);

        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      const client = new window.WebTorrent();

      // Add the magnet link
      client.add(magnetUri, (torrent) => {
        console.log("✅ Torrent loaded:", torrent.name);

        // Get the first video file
        const file = torrent.files.find(
          (f) =>
            f.name.endsWith(".webm") ||
            f.name.endsWith(".mp4") ||
            f.name.endsWith(".mov")
        );

        if (file) {
          // Create a blob URL for the video
          file.getBlobURL((err, url) => {
            if (err) {
              console.error("❌ Error getting blob URL:", err);
              Alert.alert("Playback Error", "Could not load stream");
              setIsLoadingTorrent(false);
              return;
            }

            setTorrentStreamUrl(url);
            setShowVideoPlayer(true);
            setIsLoadingTorrent(false);
          });
        } else {
          console.error("❌ No video file found in torrent");
          Alert.alert("Playback Error", "No video stream found");
          setIsLoadingTorrent(false);
        }
      });
    } catch (error) {
      console.error("❌ Torrent playback error:", error);
      Alert.alert("Playback Error", error.message);
      setIsLoadingTorrent(false);
    }

    // In ChatMediaRenderer
    if (message.fileType === "video_chunk") {
      // This is part of a chunked video
      return (
        <TouchableOpacity
          onPress={() => startChunkedVideoPlayback(message.sessionId)}
          style={styles.chunkedVideoContainer}
        >
          <Image
            source={{
              uri: thumbnailUrl || "https://via.placeholder.com/320x240",
            }}
            style={styles.videoThumbnail}
          />
          <View style={styles.chunkBadge}>
            <Text style={styles.chunkText}>
              🧩 {message.chunkIndex + 1}/{message.totalChunks}
            </Text>
          </View>
          <Text style={styles.videoFileName}>
            {message.fileName || "Neighborhood Video"}
          </Text>
        </TouchableOpacity>
      );
    }

    const startChunkedVideoPlayback = async (sessionId) => {
      // Get all chunks for this session
      const chunkMessages = await fetchChunksBySession(sessionId);

      // Use your NeighborhoodVideoReassembler class!
      const reassembler = new NeighborhoodVideoReassembler(neighborhoodId);

      await reassembler.watchProgressive(chunkMessages);
    };
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
    console.log("📄 File:", pinataUrl);
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
  console.log("⚠️ Edge case - has media fields but can't render:", message);
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
};
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
      thumbnailUrl: $thumbnailUrl # 🆕 ADD THIS LINE
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
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

    console.log("📥 Handling file download:", {
      fileName: message.fileName,
      fileType: message.fileType,
      ipfsUrl: ipfsUrl,
    });

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

  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null);
  const [messageCount, setMessageCount] = useState(0);

  const { data: adData, refetch: fetchRandomAd } = useQuery(
    GET_RANDOM_AFFILIATE_LINK
  );
  console.log("adData:", adData);
  const TRACK_CLICK = gql`
    mutation TrackAffiliateClick($id: ID!) {
      trackAffiliateClick(id: $id)
    }
  `;
  const [trackClick] = useMutation(TRACK_CLICK);

  // GraphQL Queries
  const { data: neighborhoodData, loading: neighborhoodLoading } = useQuery(
    GET_NEIGHBORHOOD_INFO,
    {
      variables: { id: neighborhoodId },
      //      skip: !neighborhoodId,
    }
  );

  const { loading, error, data, refetch } = useQuery(
    GET_NEIGHBORHOOD_MESSAGES,
    {
      variables: { neighborhoodId },
      fetchPolicy: "cache-and-network",
      //      skip: !isAuthenticated || !neighborhoodId,
    }
  );

  const [sendMessageMutation] = useMutation(SEND_NEIGHBORHOOD_MESSAGE);

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
    };
  }, [neighborhoodId]);

  const showRandomAd = async () => {
    try {
      console.log("🔄 Fetching random affiliate ad...");
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
    console.log("🔌 Initializing neighborhood socket...");

    const newSocket = io(BACKEND_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("✅ Neighborhood socket connected");
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
      console.log("✅ Neighborhood message sent");

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
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        // SIMPLE: Pass the actual type
        const type = asset.type === "image" ? "image" : "video";

        await unifiedUpload(
          { ...asset, name: safeFileName(asset) },
          type, // Just pass the type directly
          0,
          ""
        );
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick media");
    }
  };
  // Simple toggle in pickFile:
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync();
    if (!result.canceled) {
      const file = result.assets[0];

      if (file.size > 10 * 1024 * 1024 && Platform.OS === "web") {
        // Ask user
        Alert.alert(
          "Large Video",
          "Upload as chunked P2P video (faster for neighbors)?",
          [
            {
              text: "Regular Upload",
              onPress: () =>
                unifiedUpload(file, "video", file.size, file.mimeType),
            },
            { text: "Chunked P2P", onPress: () => uploadChunkedVideo(file) },
          ]
        );
      } else {
        unifiedUpload(file, "video", file.size, file.mimeType);
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
        console.log("📦 Using chunked upload for large video");
        await uploadChunkedVideo(asset);
        return;
      }
      let fileUri = asset.uri;
      let fileName = asset.name || asset.fileName || `file-${Date.now()}`;

      console.log("🔄 Upload with thumbnail generation:", { fileName, type });

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

        console.log("📤 Sending message with thumbnail:", messageVariables);
        await sendMessageMutation({ variables: messageVariables });
        console.log(`✅ ${type} uploaded successfully with thumbnail`);
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
    console.log("🎬 Starting chunked video upload...");

    const response = await fetch(asset.uri);
    const originalBlob = await response.blob();

    // Parameters
    const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks (adjustable)
    const totalChunks = Math.ceil(originalBlob.size / CHUNK_SIZE);
    const sessionId = `video_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    console.log(`📦 Splitting into ${totalChunks} chunks...`);

    // Generate thumbnail
    let thumbnailUrl = null;
    try {
      const { base64 } = await generateThumbnail(asset.uri);
      thumbnailUrl = base64;
    } catch (e) {
      console.log("⚠️ Could not generate thumbnail");
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

    console.log("✅ All chunks uploaded!");
    return true;
  };

  const uploadSingleChunk = async (
    chunk,
    index,
    sessionId,
    totalChunks,
    fileName
  ) => {
    return new Promise((resolve) => {
      // Load WebTorrent if needed
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        script.onload = () => {
          createTorrent();
        };
      } else {
        createTorrent();
      }

      function createTorrent() {
        const client = new window.WebTorrent();

        client.seed(
          chunk,
          {
            name: `${sessionId}_chunk_${index}`,
            announce: ["wss://tracker.openwebtorrent.com"],
          },
          (torrent) => {
            console.log(
              `✅ Chunk ${index + 1}/${totalChunks} seeded:`,
              torrent.magnetURI
            );

            // Send chunk message to chat
            sendMessageMutation({
              variables: {
                content: `Part ${index + 1}/${totalChunks} of "${fileName}"`,
                neighborhoodId: neighborhoodId,
                fileName: `chunk_${index}.mp4`,
                fileType: "video_chunk",
                magnetLink: torrent.magnetURI,
                chunkIndex: index,
                sessionId: sessionId,
                totalChunks: totalChunks,
                // Null for chunks
                imageUrl: null,
                videoUrl: null,
                fileUrl: null,
                thumbnailUrl: null,
              },
            }).then(() => {
              client.destroy(); // Clean up this client
              resolve();
            });
          }
        );
      }
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
    console.log("🔄 Starting thumbnail generation for:", videoUrl);

    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.currentTime = 2;
      video.muted = true;

      video.onloadeddata = async () => {
        console.log("✅ Video loaded successfully");

        try {
          const originalWidth = video.videoWidth;
          const originalHeight = video.videoHeight;
          const targetWidth = 320;
          const targetHeight = (originalHeight / originalWidth) * targetWidth;
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");

          console.log("🖼️ Drawing video to canvas...");
          ctx.drawImage(video, 0, 0, 320, 240);

          // 🎯 FIX: Use the reliable toDataURL() instead of convertToBlob()
          // We convert directly to a base64 JPEG, which is widely supported.
          const base64 = canvas.toDataURL("image/jpeg", 0.8); // 0.8 is quality

          // Optionally, you can log the size estimate, though not exact blob size
          const sizeEstimate = base64.length * (3 / 4) - 2;

          console.log(
            `📸 Thumbnail ready: JPEG (via DataURL), ~${sizeEstimate.toFixed(
              0
            )} bytes`
          );

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

      console.log("⏳ Loading video...");
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

  const captureStreamThumbnail = (videoElement) => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");

      // Wait for video to have data
      if (videoElement.readyState >= 2) {
        ctx.drawImage(videoElement, 0, 0, 320, 240);
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(thumbnailUrl);
      } else {
        videoElement.onloadeddata = () => {
          ctx.drawImage(videoElement, 0, 0, 320, 240);
          const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
          resolve(thumbnailUrl);
        };
      }
    });
  };

  const startNeighborhoodLiveStream = async () => {
    try {
      console.log("🔴 Starting TRUE live stream...");

      if (Platform.OS !== "web") {
        Alert.alert("Web Only", "Live streaming requires web browser");
        return;
      }

      // Get camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });

      // Show preview
      const preview = document.createElement("video");
      preview.srcObject = stream;
      preview.autoplay = true;
      preview.muted = true;
      preview.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 200px; 
      z-index: 1000; border: 2px solid #ff0000; border-radius: 8px;
    `;
      document.body.appendChild(preview);

      // Load WebTorrent
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const client = new window.WebTorrent();

      // 🎯 CRITICAL: Create a readable stream from MediaStream
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp8,opus",
        videoBitsPerSecond: 1000000, // 1 Mbps
      });

      // Buffer for live chunks
      let chunkBuffer = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunkBuffer.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Get chunks every second

      // Create a custom readable stream
      const liveStream = new ReadableStream({
        start(controller) {
          console.log("📡 Live stream controller started");
          // Push chunks as they arrive
          const pushChunks = () => {
            if (chunkBuffer.length > 0) {
              const chunk = chunkBuffer.shift();
              controller.enqueue(chunk);
            }
            setTimeout(pushChunks, 100);
          };
          pushChunks();
        },
        cancel() {
          console.log("📡 Live stream cancelled");
          mediaRecorder.stop();
        },
      });

      // Convert to WebTorrent-friendly format
      const webStream = {
        name: `live-stream-${Date.now()}.webm`,
        size: Infinity, // Live streams have unknown size
        createReadStream: () => liveStream.getReader(),
      };

      console.log("🌐 Seeding LIVE stream...");

      // 🎯 SEED AS LIVE STREAM
      const torrent = client.seed(
        webStream,
        {
          announce: [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.files.fm:7073/announce",
          ],
          // 🚨 EXPERIMENTAL: Live streaming options
          // private: true, // Don't share with DHT (better for live)
        },
        (torrent) => {
          console.log("✅ LIVE torrent created:", torrent.magnetURI);

          // 🎯 POST TO CHAT IMMEDIATELY
          const liveMessage = `🔴 **LIVE STREAM STARTED!**\n\nJoin the P2P live stream:\n\`${torrent.magnetURI}\`\n\nViewers: 0`;

          sendMessageMutation({
            variables: {
              content: liveMessage,
              neighborhoodId: neighborhoodId,
              fileName: "LIVE_STREAM.webm",
              fileType: "video",
              magnetLink: torrent.magnetURI,
              mimeType: "video/webm",
              thumbnailUrl: null,
            },
          }).then(() => {
            console.log("✅ Live stream announcement posted!");

            // Update viewer count periodically
            let viewerCount = 0;
            const updateViewers = () => {
              viewerCount = torrent.numPeers;
              console.log(`👥 Viewers: ${viewerCount}`);

              // Could update message with viewer count
              // This would require message editing capability
            };

            setInterval(updateViewers, 5000);

            // Show controls
            showStreamControls(torrent, stream, preview);
          });
        }
      );

      // Handle errors
      client.on("error", (err) => {
        console.error("❌ WebTorrent error:", err);
        Alert.alert("Stream Error", err.message);
      });
    } catch (error) {
      console.error("❌ Live stream error:", error);
      Alert.alert("Stream Error", error.message);
    }
  };

  const showStreamControls = (torrent, stream, preview) => {
    const controls = document.createElement("div");
    controls.style.cssText = `
    position: fixed; top: 220px; right: 10px; 
    background: rgba(0,0,0,0.8); color: white;
    padding: 15px; border-radius: 8px; z-index: 1001;
    border: 2px solid #ff0000;
  `;

    controls.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold; color: #ff0000;">
      🔴 LIVE STREAMING
    </div>
    <div style="margin-bottom: 5px; font-size: 12px;">
      Seeders: <span id="seeders">1</span> | 
      Peers: <span id="peers">0</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="stopStream" style="
        background: #ff4444; color: white; border: none;
        padding: 8px 15px; border-radius: 4px; cursor: pointer;
      ">Stop Stream</button>
    </div>
  `;

    document.body.appendChild(controls);

    // Update stats
    const updateStats = () => {
      document.getElementById("seeders").textContent = torrent.numPeers;
      document.getElementById("peers").textContent = torrent.wires.length;
    };
    setInterval(updateStats, 2000);

    // Stop button
    document.getElementById("stopStream").onclick = () => {
      torrent.destroy();
      stream.getTracks().forEach((track) => track.stop());
      document.body.removeChild(preview);
      document.body.removeChild(controls);

      // Post end message
      sendMessageMutation({
        variables: {
          content: "⏹️ **LIVE STREAM ENDED**",
          neighborhoodId: neighborhoodId,
        },
      });

      Alert.alert("Stream Ended", "Live stream stopped successfully");
    };
  };

  // Render Logic
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
          const showAdHere = index % 20 === 0;
          return (
            <React.Fragment key={item.id}>
              <View style={styles.messageContainer}>
                <Image
                  source={{
                    uri: getProfilePhotoUrl(item.sender?.profilePhoto),
                  }}
                  style={styles.profileImage}
                />
                <View style={styles.messageContent}>
                  <Text style={styles.username}>
                    {item.sender?.username || "Unknown"}
                  </Text>

                  <ChatMediaRenderer message={item} />

                  {!item.imageUrl && !item.videoUrl && !item.fileUrl && (
                    <Text style={styles.messageText}>{item.content}</Text>
                  )}

                  <Text style={styles.timestamp}>
                    {formatTimestamp(item.createdAt)}
                  </Text>
                </View>
              </View>
              {showAdHere && adData?.randomAffiliateLink && (
                <View style={styles.messageContainer}>
                  <Image
                    source={{
                      uri: getProfilePhotoUrl(null),
                    }}
                    style={styles.profileImage}
                  />
                  <View style={styles.messageContent}>
                    <Text style={styles.username}>CommunityAdLinks</Text>
                    <AdMessage ad={adData?.randomAffiliateLink} />
                    <Text style={styles.timestamp}>Now</Text>
                  </View>
                </View>
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

        <TouchableOpacity
          style={styles.streamButton}
          onPress={startNeighborhoodLiveStream}
          disabled={uploading}
        >
          <Text style={styles.streamButtonText}>{uploading ? "🔄" : "🎥"}</Text>
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
  streamButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: "#FF4444",
    borderRadius: 25,
    justifyContent: "center",
  },
  streamButtonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
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
});
