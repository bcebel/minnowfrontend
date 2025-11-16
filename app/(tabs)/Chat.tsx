import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
  Alert,
  Linking, // Ensure Linking is imported for file open/download
} from "react-native";
import { Text } from "react-native";
import WebTorrent from "webtorrent";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io, Socket } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker"; // Added for file picking

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
    $fileUrl: String
    $fileName: String
    $fileType: String
  ) {
    sendMessage(
      content: $content
      room: $room
      imageUrl: $imageUrl
      fileUrl: $fileUrl
      fileName: $fileName
      fileType: $fileType
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
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

// --- UTILITY FUNCTIONS ---
const startNeighborhoodStream = async () => {
  try {
    console.log("🎥 Requesting camera...");

    // 🚨 Get camera permission FIRST
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: true,
    });

    console.log("✅ Camera access granted!");

    // Show preview so user knows it's working
    const video = document.createElement("video");
    video.srcObject = stream;
    video.autoplay = true;
    video.muted = true;
    video.style.position = "fixed";
    video.style.top = "10px";
    video.style.right = "10px";
    video.style.width = "200px";
    video.style.zIndex = "1000";
    document.body.appendChild(video);

    // Now load WebTorrent and start recording
    const script = document.createElement("script");
    script.src =
      "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
    script.onload = () => {
      console.log("🚀 WebTorrent loaded, starting recording...");

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp8,opus",
      });

      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          console.log("📦 Chunk:", e.data.size, "bytes");
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        console.log("🎬 Recording stopped, creating torrent...");
        const videoBlob = new Blob(chunks, { type: "video/webm" });
        const client = new window.WebTorrent();

        client.seed(
          videoBlob,
          { name: "neighborhood-stream.webm" },
          (torrent) => {
            console.log("🌪️ TORRENT CREATED!", torrent.magnetURI);

            // Remove preview
            document.body.removeChild(video);

              navigator.clipboard.writeText(torrent.magnetURI).then(() => {
                Alert.alert(
                  "Stream Ready!",
                  `Magnet link copied to clipboard! Paste it in the chat.\n\n${torrent.magnetURI}`
                );
              });
  
            // Send to chat
   
            // Clean up
            stream.getTracks().forEach((track) => track.stop());

            Alert.alert("Success!", "Stream shared to neighborhood!");
          }
        );
      };

      // Record for 3 seconds
      mediaRecorder.start();
      console.log("⏺️ Recording started...");

      setTimeout(() => {
        mediaRecorder.stop();
        console.log("⏹️ Recording stopped");
      }, 3000);
    };

    document.head.appendChild(script);
  } catch (error) {
    console.error("❌ Camera error:", error);
    Alert.alert("Camera Error", "Please allow camera access to stream");
  }
};
// File type detection
const getFileType = (fileName: string) => {
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
  const [uploadType, setUploadType] = useState<string | null>(null); // To distinguish image/file uploads

  // Only run GraphQL query when authenticated
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { room },
    fetchPolicy: "cache-and-network",
    skip: !isAuthenticated,
    onCompleted: (data) => {
      console.log(
        "✅ GraphQL Query Success:",
        data?.messages?.length,
        "messages"
      );
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 200);
    },
    onError: (error) => {
      console.error("❌ GraphQL Query Error:", error);
      if (error.message.includes("Authentication")) {
        AsyncStorage.multiRemove(["token", "username"]).then(() => {
          Alert.alert("Session Expired", "Please log in again", [
            { text: "OK", onPress: () => router.replace("/login") },
          ]);
        });
      }
    },
  });

  const [sendMessageMutation] = useMutation(SEND_MESSAGE);

  // --- HANDLERS ---

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
        AsyncStorage.multiRemove(["token", "username"]).then(() => {
          Alert.alert("Authentication Failed", "Please log in again", [
            { text: "OK", onPress: () => router.replace("/login") },
          ]);
        });
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
    router.replace("/login");
  };

  const debugToken = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const username = await AsyncStorage.getItem("username");

      Alert.alert(
        "Debug Info",
        `Token exists: ${!!token}\nUsername: ${username}\nToken length: ${
          token?.length || 0
        }`
      );
    } catch (error) {
      console.error("Debug error:", error);
    }
  };

  // Handle file download/open
  const handleFilePress = (message: { fileUrl: string; fileName: any }) => {
    if (message.fileUrl) {
      const url = message.fileUrl.replace(
        "ipfs.filebase.io",
        "gateway.pinata.cloud"
      );

      Alert.alert(
        message.fileName || "File",
        "What would you like to do with this file?",
        [
          {
            text: "Download/Open",
            onPress: () =>
              Linking.openURL(url).catch((err) =>
                Alert.alert("Error", "Could not open file: " + err.message)
              ),
          },
          // Clipboard import needed for this
          // {
          //   text: "Copy Link",
          //   onPress: () => {
          //     Alert.alert("Copied", "File link copied to clipboard");
          //   },
          // },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  };

  // --- UPLOAD FUNCTIONS ---

  // Generic file picker function (for any file type)
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      console.log("Selected file:", file);

      await uploadFile(file);
    } catch (error) {
      console.error("File picker error:", error);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  // Image/Video picker function (optimized for media library)
  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Sorry, we need camera roll permissions to upload files."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'], // Allows both images and videos
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const fileType = getFileType(asset.uri); // Use URI to guess type if name is missing

        if (fileType === "image" || fileType === "video") {
          await uploadMedia(asset);
        } else {
          Alert.alert(
            "Unsupported Media",
            "Please use the '📎' button for general files."
          );
        }
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick media");
    }
  };

  // Upload *NON-IMAGE* file function
  const uploadFile = async (file: {
    name: any;
    size?: number | undefined;
    uri: any;
    mimeType?: string | undefined;
    lastModified?: number;
    file?: File | undefined;
    base64?: string | undefined;
  }) => {
    setUploading(true);
    setUploadType("file");

    try {
      const token = await AsyncStorage.getItem("token");
      console.log("Uploading file to IPFS...");

      const formData = new FormData();
      const response = await fetch(file.uri);
      const blob = await response.blob();

      formData.append("video", blob, file.name || `file-${Date.now()}`);
      formData.append("title", `File from ${username}`);
      formData.append("description", `Shared in ${room} chat`);

      const uploadResponse = await fetch(
        "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload failed:", uploadResponse.status, errorText);
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      const uploadResult = await uploadResponse.json();
      if (uploadResult.ipfsUrl) {
        console.log("Waiting for IPFS processing...");
        await new Promise((resolve) => setTimeout(resolve, 10000));

        const fileType = getFileType(file.name);

        await sendMessageMutation({
          variables: {
            content: file.name || "File Shared",
            room: room,
            fileUrl: uploadResult.ipfsUrl,
            fileName: file.name || "Unknown File",
            fileType: fileType,
          },
        });
      } else {
        throw new Error("No IPFS URL returned");
      }
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Could not upload file";
      Alert.alert("Upload Failed", errorMessage);
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  // Upload *IMAGE/VIDEO* media function
  const uploadMedia = async (asset: ImagePicker.ImagePickerAsset) => {
    setUploading(true);
    setUploadType(asset.type);

    try {
      const token = await AsyncStorage.getItem("token");

      let blob;
      const response = await fetch(asset.uri);
      blob = await response.blob();

      const fileName = asset.fileName || `${asset.type}-${Date.now()}.jpg`;

      console.log("Uploading media to IPFS...", fileName);

      const formData = new FormData();
      formData.append("video", blob, fileName); // Backend uses "video" field for all file uploads
      formData.append("title", `${asset.type} from ${username}`);
      formData.append("description", `Shared in ${room} chat`);

      const uploadResponse = await fetch(
        "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload failed:", uploadResponse.status, errorText);
        throw new Error(`Upload failed: ${uploadResponse.status}`);
      }

      const uploadResult = await uploadResponse.json();
      if (uploadResult.ipfsUrl) {
        await new Promise((resolve) => setTimeout(resolve, 10000));

        // Determine the message fields based on asset type
        const messageVariables = {
          content: `${
            asset.type.charAt(0).toUpperCase() + asset.type.slice(1)
          } Shared`,
          room: room,
          imageUrl: asset.type === "image" ? uploadResult.ipfsUrl : undefined,
          videoUrl: asset.type === "video" ? uploadResult.ipfsUrl : undefined,
          fileUrl: undefined, // Only use fileUrl for non-media documents
          fileName: fileName,
          fileType: asset.type,
        };

        await sendMessageMutation({ variables: messageVariables });
      } else {
        throw new Error("No IPFS URL returned");
      }
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Could not upload media";
      Alert.alert("Upload Failed", errorMessage);
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  // --- EFFECTS ---

  // Single auth check and socket initialization
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

    // Cleanup socket on unmount
    return () => {
      socket?.disconnect();
    };
  }, []);

  // --- RENDERING ---

  // Get messages from GraphQL data
  const messages = data?.messages || [];

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centerContainer}>
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
          <TouchableOpacity onPress={debugToken} style={styles.debugButton}>
            <Text style={styles.debugText}>🐛</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>🚪</Text>
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
        {messages.map(
          (item: {
            id: React.Key | null | undefined;
            sender: { profilePhoto: any; username: any };
            imageUrl: string;
            videoUrl: string;
            fileUrl: any;
            fileType: any;
            fileName: any;
            content:
              | string
              | number
              | bigint
              | boolean
              | React.ReactElement<
                  unknown,
                  string | React.JSXElementConstructor<any>
                >
              | Iterable<React.ReactNode>
              | React.ReactPortal
              | Promise<
                  | string
                  | number
                  | bigint
                  | boolean
                  | React.ReactPortal
                  | React.ReactElement<
                      unknown,
                      string | React.JSXElementConstructor<any>
                    >
                  | Iterable<React.ReactNode>
                  | null
                  | undefined
                >
              | null
              | undefined;
            createdAt: any;
          }) => {
            const mediaUrl = item.imageUrl || item.videoUrl;
            const isMedia = !!mediaUrl;
            const isFile = !!item.fileUrl && !isMedia; // File excludes images/videos sent via separate fields

            // Replace IPFS gateway for viewing
            const viewableUrl = isMedia
              ? mediaUrl?.replace("ipfs.filebase.io", "gateway.pinata.cloud")
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

                  {/* Show media (Image or Video) if imageUrl or videoUrl exists */}
                  {viewableUrl && item.imageUrl ? (
                    <View>
                      <Image
                        source={{ uri: viewableUrl }}
                        style={styles.messageImage}
                        resizeMode="cover"
                      />
                    </View>
                  ) : viewableUrl && item.videoUrl ? (
                    // Note: You need a VideoView component here for video display.
                    // Since it wasn't defined in the styles or imports, we'll display a placeholder/link for now.
                    <TouchableOpacity
                      style={[
                        styles.fileContainer,
                        { backgroundColor: "#555" },
                      ]}
                      onPress={() => Linking.openURL(viewableUrl)}
                    >
                      <Text style={styles.fileIcon}>🎬</Text>
                      <View style={styles.fileInfo}>
                        <Text style={styles.fileName}>
                          Video: {item.fileName || "Click to Play"}
                        </Text>
                        <Text style={styles.fileType}>
                          Video • Tap to stream
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : isFile ? (
                    /* Show generic file if fileUrl exists (not image/video) */
                    <TouchableOpacity
                      style={styles.fileContainer}
                      onPress={() => handleFilePress(item)}
                    >
                      <Text style={styles.fileIcon}>
                        {getFileIcon(item.fileType, item.fileName)}
                      </Text>
                      <View style={styles.fileInfo}>
                        <Text style={styles.fileName} numberOfLines={1}>
                          {item.fileName || "Download File"}
                        </Text>
                        <Text style={styles.fileType}>
                          {item.fileType || "File"} • Click to download
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    /* Show text if no media or file */
                    <Text style={styles.messageText}>{item.content}</Text>
                  )}

                  <Text style={styles.timestamp}>
                    {formatTimestamp(item.createdAt)}
                  </Text>
                </View>
              </View>
            );
          }
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        {/* File upload button */}
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickFile}
          disabled={uploading}
        >
          <Text style={styles.uploadButtonText}>
            {uploading && uploadType === "file" ? "📤" : "📎"}
          </Text>
        </TouchableOpacity>

        {/* Image/Video upload button */}
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
          style={styles.streamButton}
          onPress={startNeighborhoodStream}
        >
          <Text style={styles.streamButtonText}>🎥 Stream</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || !socket) && styles.sendButtonDisabled,
          ]}
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
    backgroundColor: "#000000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000000",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00FF00",
    paddingHorizontal: 15,
  },
  roomTitle: {
    fontSize: 18,
    color: "#00FF00",
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
    color: "#FF4444",
  },
  debugButton: {
    padding: 8,
    marginRight: 10,
  },
  debugText: {
    fontSize: 18,
    color: "#00FF00",
  },
  retryButton: {
    padding: 10,
    backgroundColor: "#00AA00",
    borderRadius: 5,
    marginTop: 10,
  },
  retryText: {
    color: "#000000",
    fontWeight: "bold",
  },
  loadingText: {
    color: "#00FF00",
    textAlign: "center",
    marginTop: 20,
    fontSize: 16,
  },
  errorText: {
    color: "#FF4444",
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
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 6,
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
  // New file styles
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
  streamButton: {
    backgroundColor: "#FF6B35",
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 25,
    marginRight: 10,
  },
  streamButtonText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 14,
  },
});
