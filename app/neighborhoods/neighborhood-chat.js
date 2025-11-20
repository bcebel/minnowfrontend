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
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

// GraphQL Queries - FIXED VERSION
const GET_NEIGHBORHOOD_MESSAGES = gql`
  query GetNeighborhoodMessages($neighborhoodId: ID!) {
    neighborhoodMessages(neighborhoodId: $neighborhoodId) {
      id
      content
      room
      createdAt
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
  mutation SendNeighborhoodMessage($content: String!, $neighborhoodId: ID!) {
    sendMessage(
      content: $content
      neighborhoodId: $neighborhoodId
      room: "neighborhood" # Required field
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
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
        // Add upload logic here
        console.log("File picked:", result.assets[0]);
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
        mediaTypes: ["images", "videos"], // Allows both images and videos
        quality: 0.8,
      });

      if (!result.canceled) {
        // Add upload logic here
        console.log("Image picked:", result.assets[0]);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick media");
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
          const mediaUrl = item.imageUrl || item.videoUrl;
          const isMedia = !!mediaUrl;
          const isFile = !!item.fileUrl && !isMedia;
          const viewableUrl = isMedia
            ? mediaUrl?.replace("ipfs.filebase.io", PINATA_GATEWAY)
            : null;

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
                  <TouchableOpacity
                    style={[styles.fileContainer, { backgroundColor: "#555" }]}
                    onPress={() => Linking.openURL(viewableUrl)}
                  >
                    <Text style={styles.fileIcon}>🎬</Text>
                    <View style={styles.fileInfo}>
                      <Text style={styles.fileName}>
                        Video: {item.fileName || "Click to Play"}
                      </Text>
                      <Text style={styles.fileType}>Tap to stream</Text>
                    </View>
                  </TouchableOpacity>
                ) : isFile ? (
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
});
