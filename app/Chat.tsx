import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput as RNTextInput,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";

import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io, Socket } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import WebTorrentWebView from "../components/WebTorrentPlayer";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

// Conditional import for FileSystem - only on native
let File: any = null;
if (Platform.OS !== "web") {
  try {
    const FileSystem = require("expo-file-system");
    File = FileSystem.File;
  } catch (error) {
    console.log("FileSystem not available on this platform");
  }
}

// GraphQL Definitions
const GET_MESSAGES = gql`
  query GetMessages($room: String) {
    messages(room: $room) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      magnetLink
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

const SEND_MESSAGE = gql`
  mutation SendMessage(
    $content: String!
    $room: String!
    $imageUrl: String
    $videoUrl: String
    $fileUrl: String
    $fileName: String
    $fileType: String
    $magnetLink: String
    $fileSize: Float
    $mimeType: String
    $ipfsHash: String
    $ipfsData: IPFSDataInput
  ) {
    sendMessage(
      content: $content
      room: $room
      imageUrl: $imageUrl
      videoUrl: $videoUrl
      fileUrl: $fileUrl
      fileName: $fileName
      magnetLink: $magnetLink
      fileType: $fileType
      fileSize: $fileSize
      mimeType: $mimeType
      ipfsHash: $ipfsHash
      ipfsData: $ipfsData
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      fileSize
      magnetLink
      mimeType
      ipfsHash
      ipfsData {
        cid
        ipfsUrl
        magnetLink
        fileType
        fileName
      }
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

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width: screenWidth } = Dimensions.get("window");

// --- UTILITY FUNCTIONS ---

// File type detection
const getFileType = (fileName: string) => {
  if (!fileName) return "unknown";

  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return "unknown";

  const imageTypes = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "avif"];
  const videoTypes = ["mp4", "mov", "avi", "mkv", "webm"];
  const docTypes = ["pdf", "doc", "docx", "txt"];
  const sheetTypes = ["xls", "xlsx", "csv"];

  if (imageTypes.includes(ext)) return "image";
  if (videoTypes.includes(ext)) return "video";
  if (docTypes.includes(ext)) return "document";
  if (sheetTypes.includes(ext)) return "spreadsheet";
  if (ext === "zip" || ext === "rar") return "archive";

  return "file";
};

const getFileIcon = (
  fileType: string | undefined,
  fileName: string | undefined
) => {
  switch (fileType) {
    case "document":
      if (fileName?.includes(".pdf")) return "📄";
      return "📝";
    case "spreadsheet":
      return "📊";
    case "archive":
      return "📦";
    case "video":
      return "🎬";
    case "image":
      return "🖼️";
    default:
      return "📎";
  }
};

// Download function for files
const downloadFile = async (url: string, fileName: string) => {
  try {
    if (Platform.OS === "web") {
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName || "download";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      await Linking.openURL(url);
    }
  } catch (error) {
    console.error("Download failed:", error);
    Alert.alert("Download Error", "Failed to download file. Please try again.");
  }
};

// --- SMART VIDEO COMPONENTS ---

// Video Thumbnail Component (collapsed state)
const VideoThumbnail = ({
  url,
  fileName,
  onExpand,
}: {
  url: string;
  fileName: string;
  onExpand: () => void;
}) => {
  return (
    <TouchableOpacity
      style={styles.videoThumbnailContainer}
      onPress={onExpand}
      activeOpacity={0.8}
    >
      <View style={styles.videoThumbnail}>
        <Image
          source={{ uri: url }}
          style={styles.videoThumbnailImage}
          contentFit="cover"
          transition={300}
        />
        <View style={styles.videoPlayOverlay}>
          <Text style={styles.videoPlayIcon}>▶</Text>
        </View>
        <View style={styles.videoDurationBadge}>
          <Text style={styles.videoDurationText}>VIDEO</Text>
        </View>
      </View>
      <Text style={styles.videoCaption} numberOfLines={1}>
        {fileName || "Tap to play video"}
      </Text>
    </TouchableOpacity>
  );
};

// Expanded Video Player Component
const ExpandedVideoPlayer = ({
  url,
  fileName,
  onCollapse,
}: {
  url: string;
  fileName: string;
  onCollapse: () => void;
}) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
    try {
      const playResult = player.play();
      if (playResult && typeof playResult.catch === "function") {
        playResult.catch((error: any) => {
          console.log("Auto-play failed:", error);
        });
      }
    } catch (error) {
      console.log("Auto-play error:", error);
    }
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const subscriptions = [
      player.addListener("playingChange", ({ isPlaying }) => {
        setIsPlaying(isPlaying);
      }),
      player.addListener("statusChange", ({ status, error }) => {
        if (status === "error") {
          console.log("Video player error:", error);
          setHasError(true);
        }
      }),
    ];

    return () => {
      subscriptions.forEach((sub) => sub.remove());
    };
  }, [player]);

  return (
    <View style={styles.expandedVideoContainer}>
      <TouchableOpacity style={styles.videoCloseButton} onPress={onCollapse}>
        <Text style={styles.videoCloseIcon}>✕</Text>
      </TouchableOpacity>

      {hasError ? (
        <View style={styles.videoErrorContainer}>
          <Text style={styles.videoErrorText}>Failed to load video</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              setHasError(false);
              player.replaceAsync(url).catch(console.error);
            }}
          >
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <VideoView
          player={player}
          style={styles.expandedVideoPlayer}
          nativeControls={true}
          allowsFullscreen={true}
          contentFit="contain"
          allowsPictureInPicture={Platform.OS !== "web"}
          onFirstFrameRender={() => console.log("Video frame rendered")}
        />
      )}

      <View style={styles.videoInfo}>
        <Text style={styles.videoFileName} numberOfLines={1}>
          {fileName || "Video"}
        </Text>
        <Text style={styles.videoStatus}>
          {hasError ? "Error" : isPlaying ? "Playing" : "Paused"}
        </Text>
      </View>
    </View>
  );
};

// Smart Video Component (manages expanded/collapsed state)
const SmartVideoPlayer = ({
  url,
  fileName,
}: {
  url: string;
  fileName: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isExpanded) {
    return (
      <ExpandedVideoPlayer
        url={url}
        fileName={fileName}
        onCollapse={() => setIsExpanded(false)}
      />
    );
  }

  return (
    <VideoThumbnail
      url={url}
      fileName={fileName}
      onExpand={() => setIsExpanded(true)}
    />
  );
};

// Document Preview Component
const ChatDocumentPreview = ({
  url,
  fileName,
  fileType,
}: {
  url: string;
  fileName: string;
  fileType: string;
}) => {
  return (
    <TouchableOpacity
      style={styles.documentContainer}
      onPress={() => downloadFile(url, fileName)}
    >
      <Text style={styles.documentIcon}>{getFileIcon(fileType, fileName)}</Text>
      <View style={styles.documentInfo}>
        <Text style={styles.documentTitle} numberOfLines={1}>
          {fileName || "Download File"}
        </Text>
        <Text style={styles.documentSubtext}>Tap to download • {fileType}</Text>
      </View>
    </TouchableOpacity>
  );
};

// HYBRID upload function
const uploadToIPFS = async (
  fileUri: string,
  fileName: string,
  fileType: string,
  token: string
) => {
  try {
    console.log("📤 Starting upload:", {
      fileUri,
      fileName,
      fileType,
      platform: Platform.OS,
    });

    let blob;
    if (Platform.OS === "web") {
      const response = await fetch(fileUri);
      blob = await response.blob();
    } else {
      const response = await fetch(fileUri);
      blob = await response.blob();
    }

    const formData = new FormData();
    formData.append("video", blob, fileName);
    formData.append("title", fileName || `Uploaded ${fileType}`);
    formData.append("description", `Shared from chat`);

    const res = await fetch(
      "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }
    );

    if (res.status === 503) {
      throw new Error(
        "Backend server is temporarily unavailable. Please try again later."
      );
    }

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload failed: ${res.status} - ${errorText}`);
    }

    const result = await res.json();
    console.log("✅ Upload successful:", result);
    return result.ipfsUrl;
  } catch (error) {
    console.error("❌ Upload error:", error);
    throw error;
  }
};

// FIXED timestamp function
const formatTimestamp = (timestamp: any) => {
  try {
    const date = new Date(
      typeof timestamp === "string" ? parseInt(timestamp) : timestamp
    );
    if (isNaN(date.getTime())) return "Now";

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday =
      new Date(now.setDate(now.getDate() - 1)).toDateString() ===
      date.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (isYesterday) {
      return `Yesterday ${date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`;
    } else {
      return `${date.toLocaleDateString([], {
        month: "numeric",
        day: "numeric",
      })} ${date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`;
    }
  } catch {
    return "Now";
  }
};
// --- ENHANCED IMAGE COMPONENT ---
const ChatImage = ({
  url,
  fileName,
  style,
}: {
  url: string;
  fileName?: string;
  style: any;
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Handle HEIC files
  const isHEIC =
    fileName?.toLowerCase().includes(".heic") ||
    url?.toLowerCase().includes(".heic");

  if (isHEIC && Platform.OS === "web") {
    return (
      <TouchableOpacity
        style={[style, styles.heicContainer]}
        onPress={() => downloadFile(url, fileName || "image.heic")}
      >
        <Text style={styles.heicIcon}>🖼️</Text>
        <Text style={styles.heicText}>HEIC Image</Text>
        <Text style={styles.heicSubtext}>Tap to download</Text>
        <Text style={styles.heicSubtext}>
          HEIC format not supported in browser
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity onPress={() => Linking.openURL(url)}>
      <Image
        source={{ uri: url }}
        style={style}
        contentFit="cover"
        transition={300}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          console.log("Image failed to load:", url);
          setHasError(true);
          setIsLoading(false);
        }}
      />

      {isLoading && !hasError && (
        <View style={[style, styles.loadingOverlay]}>
          <ActivityIndicator size="small" color="#00ffff" />
        </View>
      )}

      {hasError && (
        <View style={[style, styles.imageErrorContainer]}>
          <Text style={styles.imageErrorText}>📷</Text>
          <Text style={styles.imageErrorSubtext}>Failed to load image</Text>
          <Text style={styles.debugUrl}>{fileName || "Unknown file"}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};
// --- CHAT SCREEN COMPONENT ---

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const room = params.room || "general";

  const scrollViewRef = useRef<ScrollView>(null);
  const messageInputRef = useRef<RNTextInput>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [username, setUsername] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { room },
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
  });

  // Add useEffect for successful query
  useEffect(() => {
    if (data) {
      console.log(
        "✅ GraphQL Query Success:",
        data?.messages?.length,
        "messages"
      );
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 200);
    }
  }, [data]);

  // Add useEffect for error handling
  useEffect(() => {
    if (error) {
      console.error("❌ GraphQL Query Error:", error);
      if (error.message.includes("Authentication")) {
        handleAuthError();
      }
    }
  }, [error]);

  const [sendMessageMutation] = useMutation(SEND_MESSAGE);

  const handleAuthError = async () => {
    await AsyncStorage.multiRemove(["token", "username"]);
    setIsAuthenticated(false);
    Alert.alert("Session Expired", "Please log in again", [
      { text: "OK", onPress: () => router.replace("/login") },
    ]);
  };

  const initializeSocket = (token: string) => {
    console.log("🔌 Initializing socket with token...");

    const newSocket = io(BACKEND_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("✅ Socket connected");
      setSocket(newSocket);
      newSocket.emit("join-room", room);
    });

    newSocket.on("connect_error", (err) => {
      console.error("❌ Socket connection error:", err);
      if (err.message.includes("Authentication")) {
        handleAuthError();
      }
    });

    newSocket.on("message", (newMsg) => {
      console.log("📨 New message via socket:", newMsg);
      refetch();
    });

    setSocket(newSocket);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !socket) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      await sendMessageMutation({
        variables: {
          content: messageContent,
          room: room,
        },
      });
      console.log("✅ Message sent via GraphQL");

      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    } catch (err) {
      console.error("❌ Send message error:", err);
      Alert.alert("Error", "Failed to send message");
      setNewMessage(messageContent);
    }
  };

  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["token", "username"]);
    setIsAuthenticated(false);
    router.replace("/login");
  };

  const debugToken = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const username = await AsyncStorage.getItem("username");

      Alert.alert(
        "Debug Info",
        `Platform: ${
          Platform.OS
        }\nToken exists: ${!!token}\nUsername: ${username}\nAuthenticated: ${isAuthenticated}`
      );
    } catch (error) {
      console.error("Debug error:", error);
    }
  };

  const testMutation = async () => {
    try {
      const testData = {
        content: "Test with metadata",
        room: "general",
        imageUrl: "https://example.com/test.jpg",
        fileName: "test.jpg",
        fileType: "image",
        fileSize: 1024,
        mimeType: "image/jpeg",
        ipfsHash: "test123",
        ipfsData: {
          cid: "test123",
          ipfsUrl: "https://example.com/test.jpg",
          fileType: "image",
          fileName: "test.jpg",
        },
      };

      console.log("🧪 Testing mutation with:", testData);

      const result = await sendMessageMutation({
        variables: testData,
      });

      console.log("🧪 Mutation result:", result);
      Alert.alert("Test", "Mutation sent - check console and database");
    } catch (error) {
      console.error("🧪 Test mutation error:", error);
      Alert.alert("Test Error", error.message);
    }
  };

  const unifiedUpload = async (
    asset: any,
    type: string,
    fileSize: number,
    mimeType: string
  ) => {
    setUploading(true);
    setUploadType(type);

    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found");
      }

      let fileUri = asset.uri;
      let fileName = asset.name || asset.fileName || `${type}-${Date.now()}`;

      if (type === "image" && !fileName.includes(".")) {
        fileName += ".jpg";
      } else if (type === "video" && !fileName.includes(".")) {
        fileName += ".mp4";
      }

      console.log("🔄 Processing upload with metadata:", {
        fileUri,
        fileName,
        type,
        fileSize,
        mimeType,
        platform: Platform.OS,
      });

      const ipfsUrl = await uploadToIPFS(fileUri, fileName, type, token);

      if (ipfsUrl) {
        const ipfsHash = ipfsUrl.split("/ipfs/")[1];
        const videoResponse = await fetch(
          `${BACKEND_URL}/api/videos?cid=${ipfsHash}`
        );
        const videos = await videoResponse.json();
        const videoWithMagnet = videos.find((v) => v.cid === ipfsHash);

        const ipfsData = {
          cid: ipfsHash,
          ipfsUrl: ipfsUrl,
          magnetLink: videoWithMagnet?.magnetLink || null,
          fileType: type,
          fileName: fileName,
        };

        const messageVariables = {
          content: `${type.charAt(0).toUpperCase() + type.slice(1)} Shared`,
          room: room,
          imageUrl: type === "image" ? ipfsUrl : null,
          videoUrl: type === "video" ? ipfsUrl : null,
          fileUrl: type === "file" ? ipfsUrl : null,
          fileName: fileName,
          fileType: type,
          fileSize: fileSize,
          mimeType: mimeType,
          ipfsHash: ipfsHash,
          ipfsData: ipfsData,
          magnetLink: type === "video" ? videoWithMagnet?.magnetLink : null,
        };

        console.log("📤 Sending message with magnetLink:", {
          hasIpfsDataMagnet: !!ipfsData.magnetLink,
          hasDirectMagnet: !!messageVariables.magnetLink,
          magnetLink: messageVariables.magnetLink,
        });
        console.log("📤 Sending message with full metadata:", messageVariables);

        await sendMessageMutation({ variables: messageVariables });
        console.log(`✅ ${type} uploaded and message sent with metadata`);
      }
    } catch (error) {
      console.error(`❌ ${type} upload error:`, error);
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      console.log("Selected file:", file);

      let fileSize = file.size || 0;
      let mimeType = file.mimeType || "application/octet-stream";

      await unifiedUpload(file, "file", fileSize, mimeType);
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
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        quality: 0.8,
        allowsMultipleSelection: false,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const type = asset.type === "image" ? "image" : "video";

        let fileSize = 0;
        let mimeType = "";

        try {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          fileSize = blob.size;
          mimeType = blob.type || `image/${asset.uri.split(".").pop()}`;
        } catch (error) {
          console.log("Could not get file metadata:", error);
          fileSize = asset.fileSize || 0;
          mimeType = asset.mimeType || "image/jpeg";
        }

        console.log("📱 Image metadata:", {
          fileName: asset.fileName,
          fileSize,
          mimeType,
          type,
        });

        await unifiedUpload(asset, type, fileSize, mimeType);
      }
    } catch (error) {
      console.error("Media picker error:", error);
      Alert.alert("Error", "Failed to pick media");
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      try {
        setAuthChecked(false);
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        console.log("🔐 Auth check:", {
          tokenExists: !!token,
          username: savedUsername,
          platform: Platform.OS,
        });

        if (!token) {
          console.log("❌ No token found, redirecting to login");
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
      } finally {
        setAuthChecked(true);
      }
    };

    checkAuth();

    return () => {
      socket?.disconnect();
    };
  }, []);

  const messages = data?.messages || [];

  if (!authChecked) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Redirecting to login...</Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error: {error.message}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.roomTitle}>💬 {room} Chat</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Log Out 🚪</Text>
          </TouchableOpacity>
        </View>
      </View>

      {username && (
        <Text style={styles.userInfo}>Logged in as: {username}</Text>
      )}

      {!socket && (
        <View style={styles.connectionWarning}>
          <Text style={styles.warningText}>
            ⚠️ Connecting to chat server...
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.messagesList}
        ref={scrollViewRef}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.map((item: any) => {
          const hasImage =
            !!item.imageUrl && !item.imageUrl.startsWith("blob:");
          const hasVideo =
            !!item.videoUrl && !item.videoUrl.startsWith("blob:");
          const hasFile = !!item.fileUrl && !item.fileUrl.startsWith("blob:");
          const actualFileType =
            item.fileType || getFileType(item.fileName || "");
          const fileSizeFormatted = item.fileSize
            ? `${(item.fileSize / 1024 / 1024).toFixed(1)}MB`
            : "";
          const fileExtension = item.mimeType
            ? item.mimeType.split("/")[1]?.toUpperCase()
            : "";

          // 🔥 ADD THIS: Check for magnet links
          const hasMagnetLink =
            !!item.magnetLink || !!item.ipfsData?.magnetLink;
          const magnetLink = item.magnetLink || item.ipfsData?.magnetLink;

          // Get CID for fallback
          const cid = item.ipfsData?.cid || item.ipfsHash;

          const imageUrl = hasImage
            ? item.imageUrl?.replace("ipfs.filebase.io", PINATA_GATEWAY)
            : null;
          const videoUrl = hasVideo
            ? item.videoUrl?.replace("ipfs.filebase.io", PINATA_GATEWAY)
            : null;
          const fileUrl = hasFile
            ? item.fileUrl?.replace("ipfs.filebase.io", PINATA_GATEWAY)
            : null;

          // 🔥 ADD DEBUG LOGGING
          console.log("🎬 Message debug:", {
            id: item.id,
            content: item.content,
            fileName: item.fileName,
            fileType: item.fileType,
            hasVideo: hasVideo,
            hasMagnetLink: hasMagnetLink,
            magnetLink: magnetLink,
            hasIpfsData: !!item.ipfsData,
            ipfsData: item.ipfsData,
            cid: cid,
          });

          return (
            <View style={styles.messageContainer} key={item.id}>
              <Image
                source={{
                  uri:
                    item.sender?.profilePhoto ||
                    "https://via.placeholder.com/40",
                }}
                style={styles.profileImage}
                contentFit="cover"
                transition={300}
              />
              <View style={styles.messageContent}>
                <Text style={styles.username}>
                  {item.sender?.username || "Unknown"}
                </Text>

                {/* 🔥 UPDATED: Use WebTorrent for videos with magnet links */}
                {hasVideo && hasMagnetLink ? (
                  <WebTorrentWebView
                    video={{
                      ...item,
                      magnetLink: magnetLink,
                      cid: cid,
                      fileName: item.fileName,
                      videoUrl: videoUrl,
                    }}
                  />
                ) : hasVideo ? (
                  // Fallback to regular video player if no magnet link
                  <SmartVideoPlayer url={videoUrl} fileName={item.fileName} />
                ) : null}

                {/* IMAGE DISPLAY */}
                {hasImage && imageUrl && (
                  <TouchableOpacity onPress={() => Linking.openURL(imageUrl)}>
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.messageImage}
                      contentFit="cover"
                      transition={300}
                    />
                    {item.content && item.content !== "Image Shared" && (
                      <Text style={styles.captionText}>{item.content}</Text>
                    )}
                  </TouchableOpacity>
                )}

                {/* FILE DISPLAY */}
                {hasFile && fileUrl && (
                  <ChatDocumentPreview
                    url={fileUrl}
                    fileName={item.fileName || "Download File"}
                    fileType={actualFileType}
                  />
                )}

                {/* TEXT MESSAGE - Only show if no media */}
                {!hasImage && !hasVideo && !hasFile && (
                  <Text style={styles.messageText}>{item.content}</Text>
                )}

                {/* 🔥 ADD METADATA DEBUG INFO */}
                {(hasVideo || hasMagnetLink) && (
                  <View style={styles.metadataContainer}>
                    <Text style={styles.metadataText}>
                      {hasMagnetLink ? "🧲 P2P Available" : "🌐 Direct IPFS"}
                      {cid ? ` • CID: ${cid.substring(0, 8)}...` : ""}
                    </Text>
                  </View>
                )}

                <Text style={styles.timestamp}>
                  {formatTimestamp(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickFile}
          disabled={uploading}
        >
          <Text style={styles.uploadButtonText}>
            {uploading && uploadType === "file" ? "📤" : "📎"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickImage}
          disabled={uploading}
        >
          <Text style={styles.uploadButtonText}>
            {uploading && (uploadType === "image" || uploadType === "video")
              ? "📤"
              : "📷"}
          </Text>
        </TouchableOpacity>

        <RNTextInput
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
          style={styles.sendButton}
          onPress={sendMessage}
          disabled={!newMessage.trim() || !socket}
        >
          <Text style={styles.sendButtonText}>
            {socket ? "Send" : "Offline"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#130720",
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00ffff",
    paddingHorizontal: 15,
  },
  roomTitle: {
    fontSize: 18,
    color: "#00ffff",
    paddingVertical: 15,
    fontWeight: "bold",
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    fontSize: 18,
    color: "#151159",
  },
  debugButton: {
    padding: 8,
    marginRight: 10,
  },
  debugText: {
    fontSize: 18,
    color: "#00ffff",
  },
  retryButton: {
    padding: 10,
    backgroundColor: "#00AA00",
    borderRadius: 5,
    marginTop: 10,
  },
  retryText: {
    color: "#130720",
    fontWeight: "bold",
  },
  loadingText: {
    color: "#00ffff",
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
  },
  errorText: {
    color: "#151159",
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
  },
  userInfo: {
    fontSize: 12,
    color: "#00AA00",
    textAlign: "center",
    padding: 5,
    backgroundColor: "#111111",
  },
  connectionWarning: {
    backgroundColor: "#331100",
    padding: 10,
    alignItems: "center",
  },
  warningText: {
    fontSize: 12,
    color: "#FFAA00",
    textAlign: "center",
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
    marginBottom: 4,
    fontSize: 14,
  },
  messageText: {
    color: "#F5F2FA",
    marginBottom: 6,
    fontSize: 16,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: "#00AA00",
    opacity: 0.7,
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
    backgroundColor: "#130720",
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
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
  messageImage: {
    width: 300,
    height: 225,
    borderRadius: 8,
    marginBottom: 6,
  },
  // Video Thumbnail Styles
  videoThumbnailContainer: {
    marginBottom: 6,
  },
  videoThumbnail: {
    width: 300,
    height: 180,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#00ffff",
    position: "relative",
  },
  videoThumbnailImage: {
    width: "100%",
    height: "100%",
    opacity: 0.7,
  },
  videoPlayOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  videoPlayIcon: {
    fontSize: 32,
    color: "#F5F2FA",
    fontWeight: "bold",
  },
  videoDurationBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  videoDurationText: {
    color: "#F5F2FA",
    fontSize: 10,
    fontWeight: "bold",
  },
  videoCaption: {
    color: "#F5F2FA",
    fontSize: 12,
    marginTop: 4,
    textAlign: "left",
  },
  // Expanded Video Player Styles
  expandedVideoContainer: {
    marginBottom: 6,
    backgroundColor: "#111111",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#00ffff",
  },
  videoCloseButton: {
    position: "absolute",
    top: 4,
    right: 4,
    zIndex: 10,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  videoCloseIcon: {
    color: "#F5F2FA",
    fontSize: 12,
    fontWeight: "bold",
  },
  expandedVideoPlayer: {
    width: "100%",
    height: 500,
    borderRadius: 6,
  },
  videoInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingHorizontal: 4,
  },
  videoFileName: {
    color: "#F5F2FA",
    fontSize: 12,
    flex: 1,
  },
  videoStatus: {
    color: "#00AA00",
    fontSize: 10,
    fontWeight: "bold",
  },
  // Document preview styles
  documentContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#333333",
  },
  documentIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  documentInfo: {
    flex: 1,
  },
  documentTitle: {
    color: "#F5F2FA",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  documentSubtext: {
    color: "#00AA00",
    fontSize: 12,
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
  videoErrorContainer: {
    width: "100%",
    height: 200,
    backgroundColor: "#333333",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  videoErrorText: {
    color: "#151159",
    fontSize: 16,
    marginBottom: 10,
  },
  metadataContainer: {
    marginTop: 4,
    paddingHorizontal: 8,
  },
  metadataText: {
    color: "#888888",
    fontSize: 11,
    fontStyle: "italic",
  },
  heicContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#333333",
    borderRadius: 8,
  },
  heicIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  heicText: {
    color: "#F5F2FA",
    fontSize: 14,
    fontWeight: "bold",
  },
  heicSubtext: {
    color: "#00ffff",
    fontSize: 12,
    marginTop: 4,
  },
  imageErrorContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#333333",
    borderRadius: 8,
  },
  imageErrorText: {
    fontSize: 24,
    marginBottom: 4,
  },
  imageErrorSubtext: {
    color: "#888888",
    fontSize: 12,
  },
  debugUrl: {
    color: "#666666",
    fontSize: 10,
    marginTop: 4,
  },
  loadingOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  captionText: {
    fontSize: 14,
    color: "#CCCCCC",
    marginTop: 4,
    fontStyle: "italic",
  },
});
