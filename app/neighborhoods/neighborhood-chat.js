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
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import AdMessage from "../../components/AdMessage";

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

// FIXED ChatMediaRenderer - Only shows media when media exists
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

    setIsLoadingTorrent(true);
    
    try {
      // Load WebTorrent if needed
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
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
        const file = torrent.files.find(f => 
          f.name.endsWith('.webm') || 
          f.name.endsWith('.mp4') || 
          f.name.endsWith('.mov')
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
  // --- END NEW LOGIC ---

  // 🎯 SIMPLE RULES:

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

      // 🎯 NEW: Check file size for videos
      if (type === "video" && Platform.OS === "web") {
        // Get file size
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const fileSize = blob.size;

        if (fileSize > 10 * 1024 * 1024) {
          // 10MB
          // Use chunked upload for large videos
          await uploadChunkedVideo({
            uri: asset.uri,
            name:
              asset.fileName ||
              asset.uri.split("/").pop() ||
              "camera-video.mp4",
            size: fileSize,
          });
          return;
        }
      }

      // Small files use regular upload
      await unifiedUpload(
        {
          uri: asset.uri,
          name: asset.fileName || asset.uri.split("/").pop() || "camera-media",
          size: asset.fileSize || 0,
        },
        type,
        asset.fileSize || 0,
        ""
      );
    }
  };
  // open cameraconst openCamera = async () => {
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
        mediaTypes: ImagePicker.MediaType.All,
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const type = asset.type === "image" ? "image" : "video";

      // 🎯 NEW: Get file size
      let fileSize = 0;
      if (type === "video") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        fileSize = blob.size;
      }

      const fileName =
        asset.fileName ||
        asset.uri.split("/").pop() ||
        `${type}-${Date.now()}.${type === "image" ? "jpg" : "mp4"}`;

      // Check for large videos
      if (
        type === "video" &&
        Platform.OS === "web" &&
        fileSize > 10 * 1024 * 1024
      ) {
        await uploadChunkedVideo({
          uri: asset.uri,
          name: fileName,
          size: fileSize,
        });
        return;
      }

      await unifiedUpload(
        { uri: asset.uri, name: fileName, size: fileSize },
        type,
        fileSize,
        ""
      );
    } catch (error) {
      console.error("Camera capture error:", error);
      Alert.alert("Error", "Failed to capture media");
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };
  // 🎯 Add this function in neighborhood-chat.js (near uploadChunkedVideo)
  const sendMultistreamMessage = async (
    torrent,
    sessionId,
    fileName,
    totalChunks
  ) => {
    console.log("📤 Sending multistream message...");
    console.log("Magnet URI:", torrent.magnetURI);

    // Verify magnet link
    if (!torrent.magnetURI.includes("urn:btih:")) {
      console.error("❌ Invalid magnet link:", torrent.magnetURI);
      throw new Error("Invalid magnet link generated");
    }

    try {
      await sendMessageMutation({
        variables: {
          content: `🎯 MULTISTREAM Torrent: ${totalChunks} chunks in one link`,
          neighborhoodId: neighborhoodId,
          fileName: `${fileName} (Multistream)`,
          fileType: "video_multistream",
          magnetLink: torrent.magnetURI,
          sessionId: sessionId,
          totalChunks: totalChunks,
          imageUrl: null,
          videoUrl: null,
          fileUrl: null,
          thumbnailUrl: null,
        },
      });

      console.log("✅ Multistream message sent!");

      // Monitor seeding
      console.log("🌱 Now seeding:", torrent.name);
      console.log("📊 Initial stats:", {
        files: torrent.files.length,
        fileNames: torrent.files.map((f) => f.name),
        fileSizes: torrent.files.map((f) => f.length),
        ready: torrent.ready,
        peers: torrent.numPeers,
      });

      return torrent.magnetURI;
    } catch (error) {
      console.error("❌ Failed to send multistream message:", error);
      throw error;
    }
  };

  // 🎯 ADD THIS FUNCTION SOMEWHERE IN YOUR FILE:
  const uploadChunkedVideo = async (asset) => {
    console.log("🚀 uploadChunkedVideo called for:", asset.name);

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const CHUNK_SIZE = 2 * 1024 * 1024;
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
    const sessionId = `video_${Date.now()}`;

    // Create files
    const chunkFiles = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, blob.size);
      const chunkBlob = blob.slice(start, end, "video/mp4");
      const chunkFile = new File([chunkBlob], `chunk_${i}.mp4`, {
        type: "video/mp4",
        lastModified: Date.now(),
      });
      chunkFiles.push(chunkFile);
    }

    console.log("✅ Created", chunkFiles.length, "chunk files");

    // Use the global client
    const client = window.globalWebTorrentClient;

    return new Promise((resolve) => {
      client.seed(
        chunkFiles,
        {
          name: `${sessionId}_multistream`,
          announce: window.enhancedTrackers,
        },
        (torrent) => {
          console.log("✅ Torrent created with files:", torrent.files.length);

          // Send message
          sendMessageMutation({
            variables: {
              content: `🎬 Video (${totalChunks} chunks)`,
              neighborhoodId: neighborhoodId,
              fileName: asset.name || "video.mp4",
              fileType: "video_multistream",
              magnetLink: torrent.magnetURI,
              sessionId: sessionId,
              totalChunks: totalChunks,
              thumbnailUrl: null, // You can add thumbnail later
            },
          }).then(() => {
            console.log("✅ Message sent!");
            resolve();
          });
        }
      );
    });
  };

  const debugForceSeed = async () => {
    // Get a magnet link from your chat
    const magnetUri =
      "magnet:?xt=urn:btih:3a9cb5f4fa3df2129ceae0bfd833c452deede717&dn=video_1764910082359_2mlo99wje_multis";

    console.log("🔧 Force seeding existing torrent...");

    if (!window.WebTorrent) {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
      document.head.appendChild(script);
      await new Promise((resolve) => (script.onload = resolve));
    }

    // Create client that WON'T be destroyed
    if (!window.debugSeeder) {
      window.debugSeeder = new window.WebTorrent();
      console.log("🌐 Created debug seeder");
    }

    const client = window.debugSeeder;

    // First download the torrent (so we have files)
    client.add(magnetUri, (torrent) => {
      console.log("📥 Downloaded torrent, now seeding...");
      console.log(
        "Torrent files:",
        torrent.files.map((f) => f.name)
      );

      // The torrent automatically seeds after download
      // But we need to keep the client alive

      // Monitor
      setInterval(() => {
        console.log("🌱 Seeding:", {
          peers: torrent.numPeers,
          progress: torrent.progress,
          uploaded: torrent.uploaded,
        });
      }, 5000);

      Alert.alert(
        "Seeding Started",
        "Now try downloading from another browser!"
      );
    });
  };

  // Add this button somewhere in your UI

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
        const type = asset.type === "image" ? "image" : "video";

        // 🎯 NEW: Get file size for videos
        let fileSize = asset.fileSize || 0;

        if (type === "video" && Platform.OS === "web" && !fileSize) {
          // Get size from blob if not provided
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          fileSize = blob.size;
        }

        // Check if large video
        if (
          type === "video" &&
          Platform.OS === "web" &&
          fileSize > 10 * 1024 * 1024
        ) {
          await uploadChunkedVideo({
            uri: asset.uri,
            name: safeFileName(asset),
            size: fileSize,
          });
          return;
        }

        await unifiedUpload(
          { ...asset, name: safeFileName(asset), size: fileSize },
          type,
          fileSize,
          ""
        );
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick media");
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        const file = result.assets[0];

        // SMART: Detect actual file type instead of always using "file"
        const detectFileType = (fileName, mimeType) => {
          const extension = fileName.split(".").pop()?.toLowerCase();
          const imageExtensions = [
            "jpg",
            "jpeg",
            "png",
            "gif",
            "webp",
            "heic",
            "bmp",
          ];
          const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm"];

          if (imageExtensions.includes(extension)) return "image";
          if (videoExtensions.includes(extension)) return "video";
          if (mimeType?.startsWith("image/")) return "image";
          if (mimeType?.startsWith("video/")) return "video";
          return "file";
        };

        const detectedType = detectFileType(file.name, file.mimeType);

        console.log("📁 File picker detected:", {
          fileName: file.name,
          mimeType: file.mimeType,
          detectedType,
        });

        await unifiedUpload(
          file,
          detectedType, // Use the detected type!
          file.size || 0,
          file.mimeType || "application/octet-stream"
        );
      }
    } catch (error) {
      console.error("File picker error:", error);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  // SIMPLE Upload - JUST STORE WHAT WE GET
  const unifiedUpload = async (asset, type, fileSize, mimeType) => {
    setUploading(true);
    setUploadType(type);

    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

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

 const startNeighborhoodStream = async () => {
   try {
     console.log("🎥 Starting neighborhood stream...");

     // Check platform compatibility
     if (Platform.OS !== "web") {
       Alert.alert(
         "Web Only",
         "Live streaming is currently available on web browsers only",
         [{ text: "OK" }]
       );
       return;
     }

     // Check camera permissions
     const stream = await navigator.mediaDevices.getUserMedia({
       video: {
         width: { ideal: 1280 },
         height: { ideal: 720 },
       },
       audio: true,
     });

     console.log("✅ Camera access granted!");

     // Show preview
     const video = document.createElement("video");
     video.srcObject = stream;
     video.autoplay = true;
     video.muted = true;
     video.style.position = "fixed";
     video.style.top = "10px";
     video.style.right = "10px";
     video.style.width = "200px";
     video.style.zIndex = "1000";
     video.style.border = "2px solid #00ffff";
     video.style.borderRadius = "8px";
     document.body.appendChild(video);

     // 🎯 FIX 1: Check if WebTorrent is already loaded
     if (!window.WebTorrent) {
       // Load WebTorrent if not already loaded
       const script = document.createElement("script");
       script.src =
         "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
       document.head.appendChild(script);

       // Wait for script to load
       await new Promise((resolve) => {
         script.onload = resolve;
       });
     }

     console.log("🎬 WebTorrent loaded, starting recording...");

     const mediaRecorder = new MediaRecorder(stream, {
       mimeType: "video/webm; codecs=vp8,opus",
       videoBitsPerSecond: 2500000,
     });

     const chunks = [];
     mediaRecorder.ondataavailable = (e) => {
       if (e.data.size > 0) {
         chunks.push(e.data);
       }
     };

     // 🎯 FIX 2: Show recording indicator
     const recordingIndicator = document.createElement("div");
     recordingIndicator.style.position = "fixed";
     recordingIndicator.style.top = "10px";
     recordingIndicator.style.left = "10px";
     recordingIndicator.style.backgroundColor = "rgba(255, 0, 0, 0.7)";
     recordingIndicator.style.color = "white";
     recordingIndicator.style.padding = "8px 12px";
     recordingIndicator.style.borderRadius = "8px";
     recordingIndicator.style.zIndex = "1001";
     recordingIndicator.style.fontFamily = "Arial, sans-serif";
     recordingIndicator.innerText = "● Recording... (10s)";
     document.body.appendChild(recordingIndicator);

    let streamThumbnailUrl = null;
    video.onloadeddata = async () => {
      try {
        streamThumbnailUrl = await captureStreamThumbnail(video);
        console.log("✅ Stream thumbnail captured");
      } catch (err) {
        console.error("❌ Thumbnail capture failed:", err);
      }
    };

     mediaRecorder.onstop = async () => {
       console.log("⏹️ Recording stopped, creating WebTorrent seed...");

       // Remove indicators
       document.body.removeChild(recordingIndicator);
       document.body.removeChild(video);

       const videoBlob = new Blob(chunks, { type: "video/webm" });
       const client = new window.WebTorrent();

       try {
         // Show uploading indicator
         const uploadingIndicator = document.createElement("div");
         uploadingIndicator.style.position = "fixed";
         uploadingIndicator.style.top = "50px";
         uploadingIndicator.style.left = "10px";
         uploadingIndicator.style.backgroundColor = "rgba(0, 255, 255, 0.7)";
         uploadingIndicator.style.color = "black";
         uploadingIndicator.style.padding = "8px 12px";
         uploadingIndicator.style.borderRadius = "8px";
         uploadingIndicator.style.zIndex = "1001";
         uploadingIndicator.style.fontFamily = "Arial, sans-serif";
         uploadingIndicator.innerText = "⏳ Creating P2P stream...";
         document.body.appendChild(uploadingIndicator);

         client.seed(
           videoBlob,
           {
             name: `neighborhood-stream-${Date.now()}.webm`,
             announce: [
               "wss://tracker.openwebtorrent.com",
               "wss://tracker.btorrent.xyz",
               "wss://tracker.files.fm:7073/announce",
             ],
           },
           async (torrent) => {
             document.body.removeChild(uploadingIndicator);

             console.log("✅ WebTorrent seeding started:", torrent.magnetURI);

             try {
               // Create message content
               const messageContent = `🎥 Neighborhood Live Stream Clip!`;

               // Copy magnet link to clipboard
               await navigator.clipboard.writeText(torrent.magnetURI);

               // 🎯 FIX 3: Send proper mutation variables
              await sendMessageMutation({
              variables: {
                content: messageContent,
                neighborhoodId: neighborhoodId,
                fileName: "neighborhood-stream.webm",
                fileType: "video",
                magnetLink: torrent.magnetURI,
                mimeType: "video/webm",
                thumbnailUrl: streamThumbnailUrl, // 🎯 Include thumbnail!
              },
      
               });

               console.log("✅ Stream message sent to chat!");

               // 🎯 FIX 4: Use setTimeout for Alert to ensure UI updates
               setTimeout(() => {
                 Alert.alert(
                   "🎬 Stream Shared!",
                   "Your live stream clip has been shared to the neighborhood chat with P2P magnet link!\n\nMagnet link copied to clipboard.",
                   [{ text: "OK" }]
                 );
               }, 100);

               // Trigger refetch to show new message
               refetch();
             } catch (error) {
               console.error("❌ Error sharing stream:", error);
               Alert.alert(
                 "Stream Ready",
                 `Created P2P stream! Magnet link copied to clipboard:\n\n${torrent.magnetURI}\n\nError sending to chat: ${error.message}`
               );
             }

             // Clean up
             stream.getTracks().forEach((track) => track.stop());
           }
         );

         // Optional: Handle seeding errors
         client.on("error", (err) => {
           console.error("❌ WebTorrent error:", err);
           Alert.alert(
             "Stream Error",
             "Failed to create P2P stream: " + err.message
           );
         });
       } catch (error) {
         console.error("❌ WebTorrent seeding error:", error);
         Alert.alert(
           "Stream Error",
           "Failed to start P2P streaming: " + error.message
         );
         stream.getTracks().forEach((track) => track.stop());
       }
     };

     // Record for 10 seconds (neighborhood clip)
     mediaRecorder.start();
     console.log("⏺️ Recording started for 10 seconds...");

     // Update recording timer
     let timeLeft = 10;
     const timerInterval = setInterval(() => {
       timeLeft--;
       recordingIndicator.innerText = `● Recording... (${timeLeft}s)`;
       if (timeLeft <= 0) {
         clearInterval(timerInterval);
       }
     }, 1000);

     setTimeout(() => {
       if (mediaRecorder.state === "recording") {
         mediaRecorder.stop();
         console.log("⏹️ Recording stopped automatically");
       }
       clearInterval(timerInterval);
     }, 10000);
   } catch (error) {
     console.error("❌ Stream error:", error);
     Alert.alert(
       "Camera Error",
       error.message.includes("NotFoundError") ||
         error.message.includes("NotAllowedError")
         ? "Please allow camera and microphone access to start a neighborhood stream"
         : `Error: ${error.message}`
     );
   }
 };

  const testAd = {
    url: "https://www.tkqlhce.com/click-101316119-15402725", // Replace with your actual CJ.com affiliate link
    title: "Test Ad",
    id: "test-1",
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
      <WebTorrentManager />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/neighborhood-gallery?neighborhoodId=${neighborhoodId}`
            )
          }
          style={styles.galleryButton}
        >
          <Text style={styles.galleryButtonText}> 🖼 GALLERY 🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={debugForceSeed}>
          <Text>🔧 Force Seed Test</Text>
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
          // 🟢 ADD NULL CHECK HERE TOO
          if (!item) return null;

          const showAdHere = index % 20 === 0;
          return (
            <React.Fragment key={item.id}>
              {/* Regular message first */}
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

                  {/* 🟢 Ensure item is passed */}
                  <ChatMediaRenderer message={item} />

                  {!item.imageUrl && !item.videoUrl && !item.fileUrl && (
                    <Text style={styles.messageText}>{item.content}</Text>
                  )}

                  <Text style={styles.timestamp}>
                    {formatTimestamp(item.createdAt)}
                  </Text>
                </View>
              </View>

              {/* ... rest ... */}
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
          onPress={startNeighborhoodStream}
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
});
