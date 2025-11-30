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
import { useVideoPlayer, VideoView } from "expo-video";
import WebTorrentWebView from "../../components/WebTorrentPlayer";
import WebTorrentImage from "../../components/WebTorrentImage"; // Add this import

const safeFileName = (asset) =>
  asset.name || asset.fileName || asset.uri.split("/").pop() || "media";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const getFileType = (fileName) => {
  if (!fileName) return "unknown";
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (["mp4", "mov", "webm"].includes(ext)) return "image";
  if (["pdf", "doc", "docx"].includes(ext)) return "document";
  return "unknown";
};
// Simple Video Player Component
const SimpleVideoPlayer = ({ url, fileName }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

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
          {fileName}
        </Text>
      )}
    </TouchableOpacity>
  );
};


// Unified Media Renderer - EXTRACT CID FROM FILENAME
// Unified Media Renderer - USING BOTH WebTorrentImage AND WebTorrentWebView
// FIXED ChatMediaRenderer - Better video handling
const ChatMediaRenderer = ({ message }) => {
  const { magnetLink, fileName, fileType, cid, videoUrl } = message;

  console.log("🖼️ Rendering media:", { magnetLink, fileType, fileName, cid, hasVideoUrl: !!videoUrl });

  // Extract CID from any available source
  const extractCID = () => {
    // Use direct CID if available
    if (cid) return cid;
    
    // Try fileName first (for existing messages)
    if (fileName) {
      const cidFromFileName = fileName.split('.')[0];
      if (cidFromFileName.startsWith('Qm') || cidFromFileName.startsWith('baf')) {
        return cidFromFileName;
      }
    }
    
    // Try to extract from videoUrl
    if (videoUrl?.includes('/ipfs/')) {
      const cidFromUrl = videoUrl.split('/ipfs/')[1]?.split('?')[0]?.split('#')[0];
      if (cidFromUrl && (cidFromUrl.startsWith('Qm') || cidFromUrl.startsWith('baf'))) {
        return cidFromUrl;
      }
    }
    
    return null;
  };

  const extractedCID = extractCID();
  const pinataUrl = extractedCID ? `https://${PINATA_GATEWAY}/ipfs/${extractedCID}` : null;

  console.log("🎯 Rendering decision:", { 
    hasMagnet: !!magnetLink, 
    hasCID: !!extractedCID,
    fileType,
    extractedCID
  });

  // 🎯 PRIORITY 1: Videos with magnet links - use WebTorrentWebView
  if (fileType === "video" && magnetLink) {
    console.log("🔗 Rendering video with WebTorrentWebView");
    
    // Make sure the video object has the CID for fallback
    const videoWithCID = {
      ...message,
      cid: extractedCID // Ensure CID is available for fallback
    };
    
    return (
      <View>
        <WebTorrentWebView 
          video={videoWithCID} 
          isFocused={true}
        />
        {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
      </View>
    );
  }

  // 🎯 PRIORITY 2: Images with magnet links - use WebTorrentImage
  if (fileType === "image" && magnetLink && extractedCID) {
    console.log("🔗 Rendering image with WebTorrentImage");
    return (
      <View style={styles.magnetContainer}>
        <WebTorrentImage 
          image={{ 
            magnetLink, 
            cid: extractedCID,
            fileName: fileName || "Image"
          }} 
          isFocused={true}
        />
        {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
      </View>
    );
  }

  // 🎯 PRIORITY 3: Direct video URL (Pinata fallback)
  if (fileType === "video" && pinataUrl) {
    console.log("🎥 Rendering video with Pinata URL:", pinataUrl);
    return (
      <SimpleVideoPlayer
        url={pinataUrl}
        fileName={fileName || "Video"}
      />
    );
  }

  // 🎯 PRIORITY 4: Direct image URL (Pinata fallback)
  if (fileType === "image" && pinataUrl) {
    console.log("🖼️ Rendering image with Pinata URL:", pinataUrl);
    return (
      <TouchableOpacity
        onPress={() => console.log("Open image:", pinataUrl)}
      >
        <Image
          source={{ uri: pinataUrl }}
          style={styles.messageImage}
          resizeMode="cover"
        />
        {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
      </TouchableOpacity>
    );
  }

  // 🎯 FALLBACK: Show file info
  console.log("🔄 Showing fallback file info");
  return (
    <TouchableOpacity
      style={styles.fileContainer}
      onPress={() => {
        Alert.alert(
          "File Info",
          `File: ${fileName}\nType: ${fileType}\n\n${
            magnetLink ? "P2P Available" : 
            extractedCID ? "CID: " + extractedCID : 
            "No media data"
          }`
        );
      }}
    >
      <Text style={styles.fileIcon}>
        {fileType === "image" ? "🖼️" : 
         fileType === "video" ? "🎥" : "📎"}
      </Text>
      <View style={styles.fileInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || "File"}
        </Text>
        <Text style={styles.fileType}>
          {fileType || "File"} • {
            magnetLink ? "P2P Available" :
            extractedCID ? "Direct download" : 
            "No URL"
          }
        </Text>
      </View>
    </TouchableOpacity>
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
      room
      createdAt
      sender {
        id
        username
        profilePhoto
      }
      # 🚨 REMOVED neighborhood field to avoid the ID conversion issues
    }
  }
`;

const GET_RANDOM_AFFILIATE_LINK = gql`
  query GetRandomAffiliateLink {
    randomAffiliateLink {
      id
      url
      title
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
  const [showAd, setShowAd] = useState(false);
  const [currentAd, setCurrentAd] = useState(null);

  const { data: adData, refetch: fetchRandomAd } = useQuery(
    GET_RANDOM_AFFILIATE_LINK
  );

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
  useEffect(() => {
    if (data?.neighborhoodMessages) {
      const newCount = data.neighborhoodMessages.length;

      // Every 20 messages, show an ad
      if (newCount > 0 && newCount % 20 === 0 && newCount !== messageCount) {
        setMessageCount(newCount);
        showRandomAd();
      } else {
        setMessageCount(newCount);
      }
    }
  }, [data?.neighborhoodMessages]);

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

  const AdMessage = ({ ad }) => (
    <View style={styles.adContainer}>
      <View style={styles.adHeader}>
        <Text style={styles.adBadge}>🛍️ Sponsored</Text>
      </View>
      <View style={styles.adContent}>
        <Text style={styles.adTitle}>{ad.title || "Check this out!"}</Text>
        {ad.description ? (
          <Text style={styles.adDescription}>{ad.description}</Text>
        ) : null}

        {/* Iframe alternative for React Native */}
        <TouchableOpacity
          style={styles.adButton}
          onPress={() => Linking.openURL(ad.url)}
        >
          <Text style={styles.adButtonText}>Visit Site</Text>
        </TouchableOpacity>

        <Text style={styles.adUrl}>{ad.url}</Text>
      </View>
    </View>
  );
  // Socket Initialization
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
      console.log("📨 New neighborhood message:", newMsg);
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

  // File Upload Functions
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        const file = result.assets[0];
        await unifiedUpload(
          file,
          "file",
          file.size || 0,
          file.mimeType || "application/octet-stream"
        );
      }
    } catch (error) {
      console.error("File picker error:", error);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Camera roll permissions required");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const type = asset.type === "image" ? "image" : "video";

        await unifiedUpload(
          { ...asset, name: safeFileName(asset) },
          type,
          0,
          ""
        );
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick media");
    }
  };
const unifiedUpload = async (asset, type, fileSize, mimeType) => {
  setUploading(true);
  setUploadType(type);

  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) throw new Error("No authentication token found");

    let fileUri = asset.uri;
    let fileName = asset.name || asset.fileName || `${type}-${Date.now()}`;

    // FIXED detectActualType function
    const detectActualType = () => {
      const extension = fileName.split(".").pop().toLowerCase();
      const imageExtensions = [
        "jpg",
        "jpeg",
        "png",
        "gif",
        "webp",
        "heic",
        "bmp",
      ];
      const videoExtensions = ["mp4", "mov", "avi", "mkv", "webm", "quicktime"];

      if (imageExtensions.includes(extension)) return "image";
      if (videoExtensions.includes(extension)) return "video";
      return "file";
    };

    const actualType = detectActualType();

    // Preserve original extension
    if (!fileName.includes(".")) {
      const originalExtension = asset.uri.split(".").pop().toLowerCase();
      fileName += `.${originalExtension}`;
    }

    console.log("🔄 Uploading to IPFS:", { fileName, actualType });

    // Get BOTH ipfsUrl AND magnetLink from the upload
    const { ipfsUrl, magnetLink } = await uploadToIPFS(
      fileUri,
      fileName,
      actualType,
      token
    );

    if (ipfsUrl) {
      // ✅ EXTRACT CID from IPFS URL
      const cid = ipfsUrl.split("/ipfs/")[1]?.split("?")[0];
      console.log("📝 Extracted CID:", cid);

      const content = magnetLink
        ? `🔗 P2P ${
            actualType.charAt(0).toUpperCase() + actualType.slice(1)
          }: ${fileName}`
        : `📁 ${
            actualType.charAt(0).toUpperCase() + actualType.slice(1)
          }: ${fileName}`;

      // ✅ CRITICAL: ALWAYS include CID in message variables
      const messageVariables = {
        content,
        neighborhoodId: neighborhoodId,
        fileName,
        fileType: actualType, // This should be "video" not "video/quicktime"
        cid: cid || null, // ✅ MUST include CID
        magnetLink: magnetLink || null,
      };

      // Store in appropriate URL field based on type
      if (actualType === "image") {
        messageVariables.imageUrl = ipfsUrl;
      } else if (actualType === "video") {
        messageVariables.videoUrl = ipfsUrl;
      } else if (actualType === "file") {
        messageVariables.fileUrl = ipfsUrl;
      }

      console.log("📤 Sending message with CID:", messageVariables);
      await sendMessageMutation({ variables: messageVariables });
      console.log(
        `✅ ${actualType} uploaded and message sent with CID: ${cid}`
      );
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

const uploadToIPFS = async (fileUri, fileName, type, token) => {
  try {
    const response = await fetch(fileUri);
    const blob = await response.blob();

    const formData = new FormData();
    formData.append("video", blob, fileName);
    formData.append("title", fileName);
    formData.append("description", `Uploaded ${type} - ${fileName}`);

    console.log("📤 IPFS Upload:", { fileName, type, size: blob.size });

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

    // ✅ Return both values so unifiedUpload can use them
    return { ipfsUrl, magnetLink };
  } catch (error) {
    console.error("❌ IPFS upload error:", error);
    throw error;
  }
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

      // Load WebTorrent
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
      script.onload = () => {
        console.log("🚀 WebTorrent loaded, starting recording...");

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

        mediaRecorder.onstop = async () => {
          console.log("🎬 Recording stopped, creating torrent...");
          const videoBlob = new Blob(chunks, { type: "video/webm" });
          const client = new window.WebTorrent();

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
              console.log("🌪️ Torrent created:", torrent.magnetURI);

              document.body.removeChild(video);

              try {
                // Copy to clipboard
                await navigator.clipboard.writeText(torrent.magnetURI);

                // Send to neighborhood chat
                await sendMessageMutation({
                  variables: {
                    content: messageContent,
                    neighborhoodId,
                    imageUrl: null,
                    videoUrl: null,
                    fileUrl: null,
                    fileName: null,
                    fileType: null,
                    magnetLink: null,
                  },
                });

                Alert.alert(
                  "Stream Shared!",
                  "Your live stream has been shared to the neighborhood chat with P2P magnet link!",
                  [{ text: "OK" }]
                );
              } catch (error) {
                console.error("Error sharing stream:", error);
                Alert.alert(
                  "Stream Ready",
                  `Magnet link copied to clipboard! Paste it manually:\n\n${torrent.magnetURI}`
                );
              }

              // Clean up
              stream.getTracks().forEach((track) => track.stop());
            }
          );
        };

        // Record for 10 seconds (neighborhood clip)
        mediaRecorder.start();
        console.log("⏺️ Recording started...");

        setTimeout(() => {
          if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
            console.log("⏹️ Recording stopped");
          }
        }, 10000);
      };

      document.head.appendChild(script);
    } catch (error) {
      console.error("❌ Stream error:", error);
      Alert.alert(
        "Camera Error",
        "Please allow camera access to start a neighborhood stream"
      );
    }
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
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← Back</Text>
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
          const adEvery = 20;
          const showAdHere = index && index % 20 === 0;
          console.log("adData:", adData);
          return (
            <React.Fragment key={item.id}>
              {showAdHere && adData?.randomAffiliateLink && (
                <AdMessage ad={adData.randomAffiliateLink} />
              )}
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
    padding: 20,
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
    alignItems: "center",
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
    maxWidth: 800, // Maximum size on large screens
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
    color: "#FFFFFF",
    fontSize: 14,
    marginTop: 8,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  fileNameText: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
    textAlign: "center",
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
});
