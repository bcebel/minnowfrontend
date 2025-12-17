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
import { Blob } from "expo-blob";
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
import LiveStreamMessage from "../../components/LiveStreamMessage";
import LiveStreamPlayer from "../../components/LiveStreamPlayer";
import NeighborhoodLiveStreamPlayer from "../../components/NeighborhoodLiveStreamPlayer"; 
import NeighborhoodLiveStreamRecorder from "../../components/NeighborhoodLiveStreamRecorder";

const playStream = (magnetLink) => {
  if (Platform.OS !== "web") {
    Alert.alert("Web Only", "Stream playback requires web browser");
    return;
  }

  // 1. Use the GLOBAL client that's already running
  const client = window.globalWebTorrentClient;
  if (!client) {
    alert("Global WebTorrent client not found. Please refresh.");
    return;
  }

  // 2. Check if the torrent is already in the client (being seeded)
  const existingTorrent = client.get(magnetLink);
  if (existingTorrent) {
    console.log("📦 Torrent already in client, ready to play!");
    renderTorrentVideo(existingTorrent);
    return;
  }

  // 3. If not, add it to the SAME global client
  console.log("➕ Adding magnet to global client:", magnetLink);
  client.add(magnetLink, (torrent) => {
    console.log("✅ Torrent added to global client:", torrent.name);
    // Add error logging
    torrent.on("error", (err) => console.error("Torrent error:", err));
    torrent.on("warning", (warn) => console.warn("Torrent warning:", warn));

    renderTorrentVideo(torrent);
  });
};

const renderTorrentVideo = (torrent) => {
  const file = torrent.files.find(
    (file) => file.name.endsWith(".webm") || file.name.endsWith(".mp4")
  );

  if (!file) {
    alert("❌ No playable video file found in torrent");
    return;
  }

  // Load WebTorrent if needed
  if (!window.WebTorrent) {
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
    document.head.appendChild(script);
    script.onload = () => playWithWebTorrent(magnetLink);
  } else {
    playWithWebTorrent(magnetLink);
  }
};

const playWithWebTorrent = (magnetLink) => {
  const client = new window.WebTorrent();

  client.add(magnetLink, (torrent) => {
    // Find video file
    const file = torrent.files.find(
      (file) => file.name.endsWith(".webm") || file.name.endsWith(".mp4")
    );

    if (file) {
      // Create video player UI (similar to your stream UI)
      const container = document.createElement("div");
      container.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: black; z-index: 9999; display: flex;
        flex-direction: column; align-items: center; justify-content: center;
      `;

      const video = document.createElement("video");
      video.controls = true;
      video.autoplay = true;
      video.style.cssText = `
        width: 100%; max-width: 800px; height: auto;
        border: 3px solid #0066cc; border-radius: 12px;
      `;

      const closeBtn = document.createElement("button");
      closeBtn.textContent = "Close";
      closeBtn.style.cssText = `
        background: #ff4444; color: white; border: none;
        padding: 10px 20px; border-radius: 6px; cursor: pointer;
        font-weight: bold; margin-top: 20px;
      `;
      closeBtn.onclick = () => {
        document.body.removeChild(container);
        torrent.destroy();
      };

      container.appendChild(video);
      container.appendChild(closeBtn);
      document.body.appendChild(container);

      // Render video
      file.renderTo(video);
    } else {
      alert("No video file found in stream");
    }
  });
};
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

function ChatMediaRenderer({ message, onStreamActive, liveChunks = [], clearProcessedChunk = () => {}
}) {
  const {
    imageUrl, videoUrl, fileUrl, magnetLink, fileName, fileType, thumbnailUrl,
  } = message;
  console.log("🔍 ChatMediaRenderer Debug:", {
    message,
    hasMagnetLink: !!message.magnetLink,
    fileType: message.fileType,
    magnetLink: message.magnetLink?.substring(0, 50) + "...",
  });
  if (!message) return null;

  // 🔥 Filter out invalid/malformed live_stream messages
  if (message.fileType === "live_stream" &&
    (!message.magnetLink || message.magnetLink.includes("undefined"))) {
    return (
      <View style={styles.liveStreamCard}>
        <Text style={styles.liveTitle}>📡 Stream initializing...</Text>
        <ActivityIndicator size="small" color="#ff4444" />
      </View>
    );
  }

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

      // 🧪 Log existing torrents to debug duplicates
      console.log("📊 Global client has", client.torrents.length, "torrents");

      // 🔍 Check if already added (avoid duplicate adds)
      const existing = client.get(magnetUri);
      if (existing) {
        console.log("✅ Reusing existing torrent:", existing.name);
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
        console.log("✅ Added to global client:", torrent.name, torrent.infoHash);

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

      console.log("🎬 Found file:", file.name, file.length, "bytes");
      createVideoPlayer(file, torrent);
      setIsLoadingTorrent(false);
    }
  };

// 🎯 SIMPLIFIED: Use WebTorrent's built-in streaming
const createVideoPlayer = (file, torrent) => {
  console.log(`📹 Creating player for: ${file.name}`);

  // Create UI container (same as before)
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

  container.appendChild(video);
  
  // 🚀 THE MAGIC: One line instead of 100+
  file.streamTo(video, (err) => {
    if (err) {
      console.error('❌ Stream error:', err);
      // Fallback to download
      fallbackToDownload(file, torrent, container, video);
    } else {
      console.log('✅ Streaming via WebTorrent');
    }
  });

  // ... rest of your UI code (close button, etc.) remains the same

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
    // Only destroy if it's a live stream torrent
    if (torrent.name && torrent.name.includes("live-")) {
      torrent.destroy();
    }
  };

  document.body.appendChild(container);
  document.body.appendChild(closeBtn);
};

  // 🆕 MANUAL STREAMING FALLBACK
  const manualStreamPlayback = (file, video) => {
    try {
      // Create a simple read stream
      const stream = file.createReadStream();
      const chunks = [];

      stream.on("data", (chunk) => {
        chunks.push(chunk);
        // Update video source periodically
        if (chunks.length % 10 === 0) {
          const blob = new Blob(chunks, { type: "video/webm" });
          video.src = URL.createObjectURL(blob);
          video.load();
        }
      });

      stream.on("end", () => {
        console.log("✅ Stream complete");
      });
    } catch (err) {
      console.error("Manual stream failed:", err);
      video.innerHTML = `
      <div style="color: white; text-align: center; padding: 50px;">
        <h3>⚠️ Stream Error</h3>
        <p>${err.message}</p>
        <p>Try downloading the file instead.</p>
      </div>
    `;
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
if (message.fileType === "live_stream_chunked") {
    // Check 2: Does it have a Session ID?
    if (!message.sessionId) {
        return <Text style={{ color: 'red' }}>Error: Stream missing ID!</Text>;
    }

    // Call the parent handler to start monitoring this session
    useEffect(() => {
        onStreamActive(message.sessionId);
    }, [message.sessionId, onStreamActive]);

    return (
      <View
        style={{ marginVertical: 10, borderWidth: 1, borderColor: "#00ffff" }}
      >
        <Text style={{ fontWeight: "bold" }}>{message.content}</Text>

        {/* 🔑 Render the player for the master message */}
        <NeighborhoodLiveStreamPlayer
          sessionId={message.sessionId}
          initialChunks={liveChunks.filter(
            (c) => c.sessionId === message.sessionId
          )}
          clearProcessedChunk={clearProcessedChunk}
          streamTitle={message.fileName}
        />
        <Text>📡 Peers: {liveChunks.length} chunks available.</Text>
      </View>
    );
  }
  // 2️⃣ Handle video_chunk (INDIVIDUAL CHUNK MESSAGE)
  if (message.fileType === "video_chunk") {
    return (
      <View style={styles.chunkIndicator}>
        <Text style={styles.chunkText}>
          🧩 Part {message.chunkIndex + 1} of live stream
        </Text>
        {message.chunkIndex === 0 && (
          <Text style={styles.liveBadge}>🔴 LIVE</Text>
        )}
      </View>
    );
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
        onPress={() => handleChunkedVideo(message.sessionId, message.totalChunks)}
        style={styles.chunkedVideoContainer}
        disabled={isDownloadingChunks}
      >
        {message.thumbnailUrl ? (
          <Image
            source={{ uri: message.thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover" />
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

  // Inside ChatMediaRenderer
  if (message.fileType === "live_stream") {
    const safeMagnet = message.magnetLink && !message.magnetLink.includes("undefined")
      ? message.magnetLink
      : null;

    if (!safeMagnet) {
      return (
        <View style={styles.liveStreamCard}>
          <Text style={styles.liveTitle}>📡 Broadcasting...</Text>
          <ActivityIndicator color="#ff4444" />
        </View>
      );
    }

    return (
      <View style={styles.liveStreamCard}>
        <Text style={styles.liveTitle}>🔴 LIVE STREAM</Text>
        <Text style={styles.streamFileName}>{message.fileName}</Text>
        <TouchableOpacity
          style={styles.playButton}
          onPress={() => handleMagnetPlay(safeMagnet)}
        >
          <Text style={styles.playButtonText}>
            {isLoadingTorrent ? "⏳ Loading..." : "▶️ Watch Stream"}
          </Text>
        </TouchableOpacity>
      </View>
    );
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
          resizeMode="cover" />
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
          fileName={fileName || "Live Stream"} />
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
            resizeMode="cover" />
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
          resizeMode="cover" />
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
  const socketRef = useRef(null);
  // 🆕 New state to track the current active session
  const [activeStreamSessionId, setActiveStreamSessionId] = useState(null);
  const [liveChunks, setLiveChunks] = useState([]);
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
  console.log("adData:", adData);
  const TRACK_CLICK = gql`
    mutation TrackAffiliateClick($id: ID!) {
      trackAffiliateClick(id: $id)
    }
  `;

  const [trackClick] = useMutation(TRACK_CLICK);
  const handleStreamActive = useCallback((sessionId) => {
    // Only set if a stream is starting or being rendered
    setActiveStreamSessionId(sessionId);
    console.log(`Live Stream started with Session ID: ${sessionId}`);
  }, []);

  const clearProcessedChunk = useCallback(
    (chunkId) => {
      // Remove the chunk from the global queue once the Player has started processing it
      setLiveChunks((prevChunks) => {
        const updatedChunks = prevChunks.filter(
          (chunk) => chunk.id !== chunkId
        );
        // Ensure the array only holds chunks for the currently active stream
        return updatedChunks.filter(
          (c) => c.sessionId === activeStreamSessionId
        );
      });
    },
    [activeStreamSessionId]
  );

  const handleDeleteMessage = async (messageId) => {
    console.log("Attempting to delete message ID:", messageId); // Log is confirmed working

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
      console.log("Deletion cancelled by user.");
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
      console.log(`✅ Message ${messageId} deleted and cache updated.`);
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

  useEffect(() => {
    // 1. Initialize Socket.io connection (if not already done)
    if (!socketRef.current) {
      socketRef.current = io(BACKEND_URL);
    }

    const socket = socketRef.current;

    // 2. Listen for new messages pushed from the server
    socket.on("neighborhoodMessage", (newMessage) => {
      // Assume newMessage comes directly from your GraphQL subscription payload

      // 3. Check if it's a new video chunk for the active stream
      if (
        newMessage.fileType === "video_chunk" &&
        newMessage.sessionId === activeStreamSessionId
      ) {
        // 4. Add the chunk to the live queue
        setLiveChunks((prevChunks) => [...prevChunks, newMessage]);
        console.log(
          `📡 New live chunk added to queue: ${newMessage.chunkIndex}`
        );
      }
    });

    return () => {
      socket.off("neighborhoodMessage");
    };
  }, [activeStreamSessionId]);

  const renderMessage = (message) => (
    <View key={message.id}>
      <ChatMediaRenderer
        message={message}
        onStreamActive={handleStreamActive}
        liveChunks={liveChunks}
        clearProcessedChunk={clearProcessedChunk}
      />
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
        console.log("🧹 Cleaning up *live* torrents only...");
        client.torrents.forEach((torrent) => {
          if (
            torrent.name?.includes("live-") ||
            torrent.name?.includes("clip_")
          ) {
            console.log(`🗑️ Destroying live torrent: ${torrent.name}`);
            torrent.destroy();
          }
        });
      }
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
          content: "🔴 LIVE NOW! Tap to watch",
          neighborhoodId: neighborhoodId,
          fileName: `${username}'s Live Stream`,
          fileType: "live_stream_chunked",

          // 🔑 CRITICAL FIX: Ensure the sessionId is included in the variables
          sessionId: sessionId,
          // totalChunks: 0, // optional
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
        await sendMessageMutation({
          variables: messageVariables,
          refetchQueries: [
            { query: GET_ALL_IMAGES }, // Assuming this is used by the gallery
            { query: GET_MY_VIDEOS }, // Assuming this is used by the gallery
            // If your gallery uses a combined query, list that too
          ],
        });
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

    const arrayBuffer = await response.arrayBuffer();
    const originalBlob = new Blob({ arrayBuffer, type: "video/mp4" });

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

  const captureStreamThumbnail = (stream) => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.muted = true;
      video.srcObject = stream;
      video.play();

      const onFrame = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(video, 0, 0, 320, 240);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
        video.removeEventListener("play", onFrame);
      };

      video.addEventListener("play", onFrame);
      // Fallback timeout
      setTimeout(() => {
        video.removeEventListener("play", onFrame);
        resolve(null);
      }, 2000);
    });
  };

  const [streamData, setStreamData] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const mediaRecorderRef = useRef(null); // Ref for MediaRecorder instance
  const streamRef = useRef(null); // Ref for the media stream (camera/mic)
  // Ensure the button calls this function:
  // <TouchableOpacity onPress={broadcastLiveClipChunked} disabled={isStreaming}>

  const broadcastLiveClipChunked = async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "Live streaming requires a browser");
      return;
    }

    // Prevent double-streaming
    if (isStreaming) {
      Alert.alert("Already Live", "You are already broadcasting a stream.");
      return;
    }

    // 1. Setup Session Identifiers
    const sessionId = `live_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const totalChunks = 0; // We don't know the total yet for a live stream

    try {
      setUploading(true); // Assuming you use this state

      // 2. Get Camera and Microphone Stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 360 },
        audio: true,
      });

      // Save stream and set state
      streamRef.current = stream;
      setActiveSessionId(sessionId);
      setIsStreaming(true);
      Alert.alert("🎤 Live", "Stream starting and messages being sent...");

      // 3. Send the Master Message
      await sendMessageMutation({
        variables: {
          content: "🔴 LIVE BROADCAST (P2P) - Tap to Play",
          neighborhoodId: neighborhoodId,
          fileName: username
            ? `${username}'s Live Broadcast`
            : "Live Broadcast",
          fileType: "live_stream_chunked", // 🔑 CRITICAL: Use the chunked type
          sessionId: sessionId, // 🔑 CRITICAL: Pass the Session ID
          totalChunks: totalChunks, // Placeholder
          thumbnailUrl: null,
        },
      });

      // 4. Setup MediaRecorder for Chunking
      const mediaRecorder = new MediaRecorder(stream, {
        // Use mimeType supported by Media Source Extensions (MSE)
        // 'video/webm;codecs=vp8,opus' is a safe cross-browser choice
        mimeType: "video/webm;codecs=vp8,opus",
      });

      mediaRecorderRef.current = mediaRecorder;
      let chunkIndex = 0;

      // 5. Handle Data Available Event (Chunking Logic)
      mediaRecorder.ondataavailable = async (e) => {
        if (e.data.size > 0) {
          console.log(
            `📦 MediaRecorder captured chunk ${chunkIndex}. Size: ${e.data.size}`
          );

          // Send each chunk to WebTorrent and then chat
          await uploadSingleChunk(
            e.data, // This is the Blob chunk (video/webm)
            chunkIndex++,
            sessionId,
            totalChunks, // Placeholder 0
            "Live Stream"
          );
        }
      };

      // 6. Start recording and collecting chunks every 5 seconds
      mediaRecorder.start(5000); // 5000ms = 5-second chunks

      setUploading(false); // Done with the initial setup
    } catch (err) {
      console.error("❌ Live Broadcast failed:", err);
      Alert.alert("Failed to Start Stream", err.message);

      // Cleanup on failure
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      setIsStreaming(false);
      setUploading(false);
    }
  };

  // You will also need a function to stop the stream
  const stopLiveStream = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    // Send the final "Stream ended" message
    sendMessageMutation({
      variables: {
        content: "⏹️ Stream ended",
        neighborhoodId: neighborhoodId,
        // The following are correctly NULL for the end message:
        sessionId: null,
        chunkIndex: null,
        totalChunks: null,
      },
    });

    // Cleanup state
    setIsStreaming(false);
    setActiveSessionId(null);

    // Stop and destroy torrents related to this session (Optional, but good cleanup)
    if (
      Platform.OS === "web" &&
      window.globalWebTorrentClient &&
      activeSessionId
    ) {
      window.globalWebTorrentClient.torrents.forEach((t) => {
        if (t.name.includes(activeSessionId)) {
          t.destroy();
        }
      });
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
      // ... inside the ScrollView component ...
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

        <TouchableOpacity
          style={[
            styles.streamButton,
            isStreaming ? styles.stopStreamButton : styles.startStreamButton,
          ]}
          onPress={isStreaming ? stopLiveStream : broadcastLiveClipChunked}
          disabled={uploading}
        >
          <Text style={styles.streamButtonText}>
            {isStreaming ? "⏹️ Stop Live" : "🎙️ Go Live (P2P)"}
          </Text>
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
        {__DEV__ && (
          <TouchableOpacity
            style={{
              backgroundColor: "#ff4444",
              padding: 12,
              margin: 10,
              borderRadius: 8,
              alignItems: "center",
            }}
            onPress={async () => {
              if (Platform.OS !== "web") {
                Alert.alert("Web only");
                return;
              }
              try {
                // 1. Record 5s
                const stream = await navigator.mediaDevices.getUserMedia({
                  video: true,
                  audio: true,
                });
                const chunks = [];
                const mr = new MediaRecorder(stream, {
                  mimeType: "video/webm;codecs=vp8,opus",
                });
                mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
                mr.onstop = async () => {
                  const blob = new Blob(chunks, { type: "video/webm" });
                  const url = URL.createObjectURL(blob);
                  console.log("✅ Blob ready", blob.size, "bytes →", url);

                  // 2. Play it locally FIRST (sanity check)
                  const video = document.createElement("video");
                  video.controls = true;
                  video.src = url;
                  video.style.cssText = `
            position: fixed; top: 20%; left: 20%; width: 60%; 
            background: black; z-index: 9999;
          `;
                  document.body.appendChild(video);
                  video
                    .play()
                    .catch((e) =>
                      console.warn("Play failed (user gesture needed)", e)
                    );

                  // 3. Seed to WebTorrent
                  const client = window.globalWebTorrentClient;
                  client.seed(blob, { name: "test.webm" }, (torrent) => {
                    console.log("🌱 Torrent:", {
                      name: torrent.name,
                      magnet: torrent.magnetURI,
                      infoHash: torrent.infoHash,
                      ready: torrent.ready,
                      done: torrent.done,
                      length: torrent.length,
                      numPeers: torrent.numPeers,
                      downloaded: torrent.downloaded,
                      uploaded: torrent.uploaded,
                      wires: torrent.wires.length,
                    });

                    // Wait until at least announced
                    torrent.on("ready", () => {
                      console.log("📡 Torrent ready and announced");
                      navigator.clipboard.writeText(torrent.magnetURI);
                      alert(
                        "✅ Magnet copied — wait 3s, then test in incognito"
                      );
                    });
                  });
                  stream.getTracks().forEach((t) => t.stop());
                };
                mr.start();
                setTimeout(() => mr.stop(), 5000);
                alert("🎥 Recording 5s test clip...");
              } catch (e) {
                console.error(e);
                alert("❌ Test failed: " + e.message);
              }
            }}
          >
            <NeighborhoodLiveStreamRecorder
              neighborhoodId={neighborhoodId}
              username={username}
            />
          </TouchableOpacity>
        )}
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
