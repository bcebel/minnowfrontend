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
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

const VideoThumbnail = ({ url, fileName, onExpand }) => {
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
const ExpandedVideoPlayer = ({ url, fileName, onCollapse }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
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
const SmartVideoPlayer = ({ url, fileName }) => {
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

// GraphQL Queries - FIXED VERSION
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
      # Temporarily remove neighborhood to test
      # neighborhood {
      #   id
      #   name
      # }
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
    $imageUrl: String
    $videoUrl: String
    $fileUrl: String
    $fileName: String
    $fileType: String
    $magnetLink: String
  ) {
    sendMessage(
      content: $content
      neighborhoodId: $neighborhoodId
      room: "neighborhood"
      imageUrl: $imageUrl
      videoUrl: $videoUrl
      fileUrl: $fileUrl
      fileName: $fileName
      fileType: $fileType
      magnetLink: $magnetLink
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      magnetLink
      room
      neighborhood {
        id
        name
      }
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

// Utility Functions
const getFileType = (fileName) => {
  if (!fileName) return "file";
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (!ext) return "file";

  const imageTypes = ["jpg", "jpeg", "png", "gif", "webp", "bmp"];
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

const getFileIcon = (fileType, fileName) => {
  switch (fileType) {
    case "document":
      return fileName?.includes(".pdf") ? "📄" : "📝";
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

const formatTimestamp = (timestamp) => {
  try {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Now";
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

  // Send Message
  const sendMessage = async () => {
    if (!newMessage.trim() || !socket) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      await sendMessageMutation({
        variables: {
          content: messageContent,
          neighborhoodId: neighborhoodId, // Make sure this is passed
          // Remove room since we're using fixed "neighborhood" value
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

  // File Handling
  const handleFilePress = (message) => {
    if (message.fileUrl) {
      const url = message.fileUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);
      Alert.alert(message.fileName || "File", "What would you like to do?", [
        {
          text: "Open",
          onPress: () =>
            Linking.openURL(url).catch((err) =>
              Alert.alert("Error", "Could not open file")
            ),
        },
        { text: "Cancel", style: "cancel" },
      ]);
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
      console.log("File picked:", file);

      let fileSize = file.size || 0;
      let mimeType = file.mimeType || "application/octet-stream";

      // Call unifiedUpload with the file
      await unifiedUpload(file, "file", fileSize, mimeType);
    }
  } catch (error) {
    console.error("File picker error:", error);
    Alert.alert("Error", "Failed to pick file");
  }
};

const pickImage = async () => {
  try {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
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

      console.log("📱 Media metadata:", {
        fileName: asset.fileName,
        fileSize,
        mimeType,
        type,
      });

      // Call unifiedUpload with the media asset
      await unifiedUpload(asset, type, fileSize, mimeType);
    }
  } catch (error) {
    console.error("Media picker error:", error);
    Alert.alert("Error", "Failed to pick media");
  }
};
  // Add this function to your neighborhood-chat.js
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
      video.style.border = "2px solid #00FF00";
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

              // Remove preview
              document.body.removeChild(video);

              try {
                // Copy to clipboard
                await navigator.clipboard.writeText(torrent.magnetURI);

                // Send to neighborhood chat
                await sendMessageMutation({
                  variables: {
                    content: "🔴 Live Neighborhood Stream",
                    neighborhoodId: neighborhoodId,
                    magnetLink: torrent.magnetURI,
                    fileName: `neighborhood-stream-${Date.now()}.webm`,
                    fileType: "video",
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
  // Add this to your neighborhood-chat.js
  const unifiedUpload = async (asset, type, fileSize, mimeType) => {
    setUploading(true);
    setUploadType(type);

    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        throw new Error("No authentication token found");
      }

      let fileUri = asset.uri;
      let fileName = asset.name || asset.fileName || `${type}-${Date.now()}`;

      // Add file extension if missing
      if (type === "image" && !fileName.includes(".")) {
        fileName += ".jpg";
      } else if (type === "video" && !fileName.includes(".")) {
        fileName += ".mp4";
      }

      console.log("🔄 Processing upload for neighborhood:", {
        fileName,
        type,
        neighborhoodId,
      });

      const ipfsUrl = await uploadToIPFS(fileUri, fileName, type, token);

      if (ipfsUrl) {
        const messageVariables = {
          content: `${type.charAt(0).toUpperCase() + type.slice(1)} Shared`,
          neighborhoodId: neighborhoodId,
          imageUrl: type === "image" ? ipfsUrl : null,
          videoUrl: type === "video" ? ipfsUrl : null,
          fileUrl: type === "file" ? ipfsUrl : null,
          fileName: fileName,
          fileType: type,
        };

        await sendMessageMutation({ variables: messageVariables });
        console.log(`✅ ${type} uploaded to neighborhood chat`);
      }
    } catch (error) {
      console.error(`❌ ${type} upload error:`, error);
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  // Add the uploadToIPFS function (same as your general chat)
  const uploadToIPFS = async (fileUri, fileName, fileType, token) => {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("video", blob, fileName);
      formData.append("title", fileName || `Uploaded ${fileType}`);
      formData.append("description", `Shared in neighborhood chat`);

      const res = await fetch(
        `${BACKEND_URL}/upload`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Upload failed: ${res.status} - ${errorText}`);
      }

      const result = await res.json();
      return result.ipfsUrl;
    } catch (error) {
      console.error("❌ Upload error:", error);
      throw error;
    }
  };
  
  // Render Logic
  const messages = data?.neighborhoodMessages || [];
  const neighborhoodName =
    neighborhoodData?.neighborhood?.name || "Neighborhood";

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00FF00" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00FF00" />
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
      {/* Header */}
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

      {/* Connection Status */}
      {!socket && (
        <View style={styles.connectionWarning}>
          <Text style={styles.warningText}>Connecting...</Text>
        </View>
      )}

      {/* Messages List */}
      <ScrollView
        style={styles.messagesList}
        ref={scrollViewRef}
        onContentSizeChange={() =>
          scrollViewRef.current?.scrollToEnd({ animated: true })
        }
      >
        {messages.map((item) => {
          // ADD DEBUG LOGGING
          console.log("💬 Chat Message Debug:", {
            id: item.id,
            content: item.content,
            imageUrl: item.imageUrl,
            videoUrl: item.videoUrl,
            fileUrl: item.fileUrl,
            fileType: item.fileType,
            hasImage: !!item.imageUrl,
            hasVideo: !!item.videoUrl,
            hasFile: !!item.fileUrl,
          });

          const mediaUrl = item.imageUrl || item.videoUrl;
          const isMedia = !!mediaUrl;
          const isFile = !!item.fileUrl && !isMedia;
          const viewableUrl = isMedia
            ? mediaUrl?.replace("ipfs.filebase.io", PINATA_GATEWAY)
            : null;

          console.log("🖼️ Processed URLs:", {
            originalMediaUrl: mediaUrl,
            viewableUrl: viewableUrl,
            isMedia,
            isFile,
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
              />
              <View style={styles.messageContent}>
                <Text style={styles.username}>
                  {item.sender?.username || "Unknown"}
                </Text>

{viewableUrl && item.imageUrl ? (
  <Image
    source={{ uri: viewableUrl }}
    style={styles.messageImage}
    resizeMode="cover"
  />
) : viewableUrl && item.videoUrl ? (
  // Check for magnet links first, then fallback to direct video
  item.magnetLink ? (
    <WebTorrentWebView
      video={{
        ...item,
        magnetLink: item.magnetLink,
        videoUrl: viewableUrl,
        fileName: item.fileName,
      }}
    />
  ) : (
    <SmartVideoPlayer 
      url={viewableUrl} 
      fileName={item.fileName || "Neighborhood Video"} 
    />
  )
) : isFile ? (  // ← This was missing the closing parenthesis for the previous condition
  <TouchableOpacity
    style={styles.fileContainer}
    onPress={() => handleFilePress(item)}
  >
                    <Text style={styles.fileIcon}>
                      {getFileIcon(item.fileType, item.fileName)}
                    </Text>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName} numberOfLines={1}>
                        {item.fileName || "File"}
                      </Text>
                      <Text style={styles.fileType}>
                        {item.fileType || "File"}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.messageText}>{item.content}</Text>
                )}
                <Text style={styles.timestamp}>
                  {formatTimestamp(item.createdAt)}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.uploadButton} onPress={pickFile}>
          <Text style={styles.uploadButtonText}>📎</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uploadButton} onPress={pickImage}>
          <Text style={styles.uploadButtonText}>📷</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.streamButton}
          onPress={startNeighborhoodStream}
          disabled={uploading}
        >
          <Text style={styles.streamButtonText}>{uploading ? "🔄" : "🎥"}</Text>
        </TouchableOpacity>
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
    color: "#00FF00",
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
    borderBottomColor: "#00FF00",
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  roomTitle: {
    fontSize: 18,
    color: "#00FF00",
    fontWeight: "bold",
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: "#00FF00",
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
    color: "#00FF00",
    marginBottom: 4,
    fontSize: 14,
  },
  messageText: {
    color: "#FFFFFF",
    marginBottom: 6,
    fontSize: 16,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: "#00AA00",
    opacity: 0.7,
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 6,
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#333333",
  },
  fileIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 4,
  },
  fileType: {
    color: "#00AA00",
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#00FF00",
    backgroundColor: "#111111",
    alignItems: "center",
  },
  messageInput: {
    flex: 1,
    backgroundColor: "#000000",
    borderWidth: 2,
    borderColor: "#00FF00",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: "#00FF00",
    marginRight: 10,
    fontSize: 16,
  },
  messageInputDisabled: {
    borderColor: "#333333",
    color: "#666666",
  },
  sendButton: {
    backgroundColor: "#00FF00",
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
    color: "#00FF00",
  },
  retryButton: {
    backgroundColor: "#00FF00",
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
    color: "#00FF00",
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
  // Video Thumbnail Styles
  videoThumbnailContainer: {
    marginBottom: 6,
  },
  videoThumbnail: {
    width: 300,
    height: 180,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#00ff00",
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
    color: "#FFFFFF",
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
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "bold",
  },
  videoCaption: {
    color: "#FFFFFF",
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
    borderColor: "#00FF00",
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
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  expandedVideoPlayer: {
    width: "100%",
    height: 300,
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
    color: "#FFFFFF",
    fontSize: 12,
    flex: 1,
  },
  videoStatus: {
    color: "#00AA00",
    fontSize: 10,
    fontWeight: "bold",
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
    color: "#FF4444",
    fontSize: 16,
    marginBottom: 10,
  },
});

