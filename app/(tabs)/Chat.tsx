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

// --- GraphQL Definitions (Same) ---
const GET_MESSAGES = gql`
  query GetMessages($room: String!) {
    messages(room: $room) {
      id
      content
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
  mutation SendMessage($content: String!, $room: String!) {
    sendMessage(content: $content, room: $room) {
      id
      content
      createdAt
      sender {
        id
        username
        profilePhoto
      }
    }
  }
`;
// ---------------------------------------------

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const room = params.room || "general";
  
  const scrollViewRef = useRef(null); 

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { room },
    skip: !username,
  });
  
  // Using the efficient 'update' function for instant UI display
  const [sendMessageMutation] = useMutation(SEND_MESSAGE, {
    update(cache, { data: { sendMessage } }) {
      const existingMessages = cache.readQuery({
        query: GET_MESSAGES,
        variables: { room },
      });

      if (existingMessages && existingMessages.messages) {
        cache.writeQuery({
          query: GET_MESSAGES,
          variables: { room },
          data: {
            messages: [sendMessage, ...existingMessages.messages],
          },
        });
      }
    },
  });

  // Message loading effect remains the same
  useEffect(() => {
    if (data) {
      setMessages(data.messages ? data.messages.slice().reverse() : []);
    }
  }, [data]);

  // Socket and auth initialization
  useEffect(() => {
    const initializeChat = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        if (!token) {
          Alert.alert("Authentication Required", "Please log in to access chat");
          router.replace("/login");
          return;
        }

        setUsername(savedUsername || "");
        initializeSocket(token);
      } catch (error) {
        console.error("Initialization error:", error);
        Alert.alert("Error", "Failed to initialize chat");
      }
    };

    const initializeSocket = (token) => {
      const newSocket = io(BACKEND_URL, {
        auth: { token },
        transports: ["websocket", "polling"],
        forceNew: true,
        timeout: 10000,
      });

      newSocket.on("connect", () => {
        setSocket(newSocket);
        newSocket.emit("join-room", room);
      });

      newSocket.on("connect_error", (err) => {
        if (err.message.includes("Authentication")) {
          AsyncStorage.multiRemove(["token", "username"]).then(() => {
            Alert.alert("Authentication Failed", "Please log in again", [
              { text: "OK", onPress: () => router.replace("/login") },
            ]);
          });
        }
      });

      newSocket.on("message", (newMsg) => {
        // 💡 CRUCIAL TEST FIX: TEMPORARILY REMOVE THE SENDER CHECK!
        // This allows us to see if the message is being successfully echoed by the server.
        // if (newMsg.sender.username !== username) { 
          setMessages((prev) => [newMsg, ...prev]);
        // }
      });

      newSocket.on("disconnect", () => {
        setSocket(null);
      });

      setSocket(newSocket);
    };

    initializeChat();

    return () => {
      if (socket) {
        socket.emit("leave-room", room);
        socket.disconnect();
      }
    };
  }, [room, username]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    
    // 💡 Security/Timing Check: Prevent send if username (token) is not fully loaded
    if (!username) { 
        Alert.alert("Error", "User identity not loaded. Please wait or log in again.");
        return;
    }

    const messageContent = newMessage.trim();
    setNewMessage(""); 

    try {
        // We ensure the token exists but let Apollo's global authLink attach the header.
        const token = await AsyncStorage.getItem("token");
        if (!token) {
            Alert.alert("Authentication Error", "Please log in to send messages.");
            router.replace("/login");
            return;
        }

        await sendMessageMutation({
            variables: {
                content: messageContent,
                room: room,
            },
            // CRITICAL: We removed the manual 'context' block to avoid conflicting with authLink
        });

    } catch (err) {
        // If you see the "Authentication required" error here, the issue is Apollo's authLink timing.
        console.error("Send message error:", err);
        Alert.alert("Error Sending", "Failed to send message: Check console for GraphQL error.");
    }
  };

  // ... (handleLogout and formatTimestamp functions remain the same) ...
  const handleLogout = async () => {
    await AsyncStorage.multiRemove(["token", "username"]);
    router.replace("/login");
  };

  const formatTimestamp = (timestamp) => {
    try {
      return new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  // ... (Loading/Error views remain the same) ...
  if (loading && !data) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading chat...</Text>
      </View>
    );
  }

  if (error) {
    console.error("GraphQL error:", JSON.stringify(error, null, 2));
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Error loading messages.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ... Header and Warnings (Same) ... */}
      <View style={styles.header}>
        <Text style={styles.roomTitle}>💬 {room} Chat</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={() => refetch()} style={styles.refreshButton}>
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
          <Text style={styles.warningText}>⚠️ Not connected to chat server</Text>
          <Text style={styles.warningSubtext}>
            You can read messages but cannot send new ones
          </Text>
        </View>
      )}

      {/* ScrollView for chat messages */}
      <ScrollView
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContentContainer}
        ref={scrollViewRef}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((item) => (
          <View style={styles.messageContainer} key={item.id}>
            <Image
              source={{ uri: item.sender?.profilePhoto || "https://via.placeholder.com/40" }}
              style={styles.profileImage}
            />
            <View style={styles.messageContent}>
              <Text style={styles.username}>{item.sender?.username || "Unknown"}</Text>
              <Text style={styles.messageText}>{item.content}</Text>
              {item.imageUrl && (
                <Image source={{ uri: item.imageUrl }} style={styles.messageImage} />
              )}
              <Text style={styles.timestamp}>{formatTimestamp(item.createdAt)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Input area */}
      <View style={styles.inputContainer}>
        <RNTextInput
          style={[styles.messageInput, (!socket || !username) && styles.messageInputDisabled]} // 💡 Added !username check
          placeholder={(socket && username) ? "Type a message..." : "Loading or Offline..."}
          placeholderTextColor="#888"
          value={newMessage}
          onChangeText={setNewMessage}
          onSubmitEditing={sendMessage}
          editable={!!socket && !!username} // 💡 Added !username check
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!newMessage.trim() || !socket || !username) && styles.sendButtonDisabled, // 💡 Added !username check
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim() || !socket || !username} // 💡 Added !username check
        >
          <Text style={styles.sendButtonText}>{(socket && username) ? "Send" : "Offline"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ... (Styles remain the same)
// ----------------------------------------------------------------------
// --- Styles (Same as before) ---
// ----------------------------------------------------------------------
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
  warningSubtext: {
    fontSize: 10,
    color: "#FFAA00",
    textAlign: "center",
    marginTop: 2,
    opacity: 0.8,
  },
  messagesList: {
    flex: 1,
  },
  messagesContentContainer: {
    flexGrow: 1, 
    justifyContent: 'flex-end',
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
    height: 200,
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#00FF00",
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
});
