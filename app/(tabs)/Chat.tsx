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
import { io } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";

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

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const room = params.room || "general";

  const scrollViewRef = useRef(null);
  const messageInputRef = useRef<RNTextInput>(null);
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Single auth check - REMOVED THE DUPLICATE
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        console.log("🔑 ChatScreen: Token exists:", !!token);
        console.log("🔑 ChatScreen: Username:", savedUsername);
        console.log("🔑 ChatScreen: Full token:", token);

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

  // Only run GraphQL query when authenticated
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { room },
    fetchPolicy: "network-and-cache",
    skip: !isAuthenticated,
    onCompleted: (data) => {
      console.log(
        "✅ GraphQL Query Success:",
        data?.messages?.length,
        "messages"
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

  const initializeSocket = (token) => {
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

const formatTimestamp = (timestamp) => {
  try {
    const date = new Date(Number(timestamp));
    if (isNaN(date.getTime())) return "Now";

    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday =
      new Date(now.setDate(now.getDate() - 1)).toDateString() ===
      date.toDateString();

    if (isToday) {
      // Today: show time only "2:30 PM"
      return date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } else if (isYesterday) {
      // Yesterday: show "Yesterday 2:30 PM"
      return `Yesterday ${date.toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}`;
    } else {
      // Older: show date "11/4 2:30 PM"
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

        // Auto-scroll after refetch
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
        // In the message rendering section, add:
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

              {/* Add image display here */}
              {item.imageUrl && (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.messageImage}
                  resizeMode="cover"
                />
              )}

              {item.content && (
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
});
