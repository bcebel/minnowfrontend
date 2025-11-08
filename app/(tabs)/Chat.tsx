import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io, Socket } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";

// GraphQL Definitions
const GET_MESSAGES = gql`
  query GetMessages($room: String) {
    messages(room: $room) {
      id
      content
      imageUrl
      videoUrl
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
  mutation SendMessage($content: String!, $room: String!, $imageUrl: String) {
    sendMessage(content: $content, room: $room, imageUrl: $imageUrl) {
      id
      content
      imageUrl
      videoUrl
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

// Add this helper function to detect if content is an image URL
const isImageUrl = (text: string) => {
  if (!text) return false;
  return (
    text.match(/\.(jpeg|jpg|gif|png|webp|bmp)$/i) !== null ||
    text.includes("picsum.photos") ||
    text.includes("placeholder.com")
  );
};

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
      console.log(
        "🔍 GRAPHQL MESSAGES DATA:",
        JSON.stringify(data?.messages, null, 2)
      );
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

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission needed",
          "Sorry, we need camera roll permissions to upload images."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });

      if (!result.canceled) {
        await uploadImage(result.assets[0].uri);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

const uploadImage = async (imageUri: string | Request) => {
  setUploading(true);

  try {
    const token = await AsyncStorage.getItem("token");

    let blob;
    if (typeof imageUri === "string" && imageUri.startsWith("blob:")) {
      const response = await fetch(imageUri);
      blob = await response.blob();
    } else if (typeof imageUri === "string") {
      const response = await fetch(imageUri);
      blob = await response.blob();
    } else {
      throw new Error("Invalid imageUri type");
    }

    console.log("Uploading image to IPFS...");

    const formData = new FormData();
    formData.append("video", blob, `chat-image-${Date.now()}.jpg`);

    // Use proper values instead of empty/default ones
    formData.append("title", `Chat image from ${username}`);
    formData.append("description", `Shared in ${room} chat`);

    // If you want to be even more specific about it being an image:
    // formData.append("fileType", "image");

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
    console.log("IPFS Upload result:", uploadResult);

    if (uploadResult.ipfsUrl) {
        console.log("Waiting for IPFS processing...");
        await new Promise((resolve) => setTimeout(resolve, 10000)); // 10 seconds
        console.log("Proceeding with IPFS URL");
      await sendMessageMutation({
        variables: {
          content: "",
          room: room,
          imageUrl: uploadResult.ipfsUrl,
        },
      });
    } else {
      throw new Error("No IPFS URL returned");
    }
  } catch (error) {
    console.error("Upload error:", error);
    const errorMessage =
      typeof error === "object" && error !== null && "message" in error
        ? (error as { message?: string }).message
        : "Could not upload image";
    Alert.alert("Upload Failed", errorMessage || "Could not upload image");
  } finally {
    setUploading(false);
  }
};
  // Single auth check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        console.log("🔑 ChatScreen: Token exists:", !!token);
        console.log("🔑 ChatScreen: Username:", savedUsername);

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
  }, []);

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

  // FIXED timestamp function
  const formatTimestamp = (timestamp: any) => {
    try {
      // Handle string timestamps that are already numeric
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

  const debugToken = async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const username = await AsyncStorage.getItem("username");

      console.log("🔍 DEBUG Token:", token);
      console.log("🔍 DEBUG Username:", username);
      console.log("🔍 DEBUG Token exists:", !!token);
      console.log("🔍 DEBUG Token length:", token?.length);

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

  // Get messages from GraphQL data
  const messages = data?.messages || [];

  useEffect(() => {
    if (socket) {
      socket.on("message", (newMsg) => {
        console.log("📨 New message via socket:", newMsg);
        refetch();

        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 200);
      });
    }
  }, [socket]);

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
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
          <TouchableOpacity
            onPress={() => refetch()}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshText}>🔄</Text>
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
        {messages.map((item) => (
          <View style={styles.messageContainer} key={item.id}>
            <Image
              source={{
                uri:
                  item.sender?.profilePhoto || "https://via.placeholder.com/40",
              }}
              style={styles.profileImage}
            />
            <View style={styles.messageContent}>
              <Text style={styles.username}>
                {item.sender?.username || "Unknown"}
              </Text>

              {/* Show image if imageUrl exists */}
              {item.imageUrl ? (
                <View>
                  {/* Try to show image */}
                  <Image
                    source={{
                      uri: item.imageUrl?.replace(
                        "ipfs.filebase.io",
                        "gateway.pinata.cloud"
                      ),
                    }}
                    style={styles.messageImage}
                    resizeMode="cover"
                    onError={() => {
                      // If image fails, show magnet link info
                      console.log(
                        "Image failed, magnet available:",
                        item.videoUrl
                      );
                    }}
                  />

                  {/* Always show the magnet link as fallback */}
                  {item.videoUrl && item.videoUrl.includes("magnet:") && (
                    <TouchableOpacity
                      style={styles.magnetLink}
                      onPress={() => {
                        Alert.alert(
                          "Torrent Available",
                          "This content is available via BitTorrent",
                          [
                            {
                              text: "Copy Magnet",
                              onPress: () => Clipboard.setString(item.videoUrl),
                            },
                            { text: "OK" },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.magnetText}>
                        🧲 Torrent Available
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                /* Show text if no image */
                <Text style={styles.messageText}>{item.content}</Text>
              )}

              <Text style={styles.timestamp}>
                {formatTimestamp(item.createdAt)}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={pickImage}
          disabled={uploading || !socket}
        >
          <Text style={styles.uploadButtonText}>{uploading ? "📤" : "📷"}</Text>
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
  debugButton: {
    padding: 8,
    marginRight: 10,
  },
  debugText: {
    fontSize: 18,
    color: "#00FF00",
  },
  refreshButton: {
    padding: 8,
    marginRight: 10,
  },
  refreshText: {
    fontSize: 18,
    color: "#00FF00",
  },
  logoutButton: {
    padding: 8,
  },
  logoutText: {
    fontSize: 18,
    color: "#FF4444",
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
  retryButton: {
    backgroundColor: "#00FF00",
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
    alignSelf: "center",
  },
  retryText: {
    color: "#000000",
    fontWeight: "bold",
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
  magnetLink: {
    backgroundColor: "#222222",
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    alignSelf: "flex-start",
  },
});
