import React, { useState, useEffect, useRef } from "react";
import { // Note: FlatList replaced with ScrollView
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

// --- GraphQL Definitions (Remain the same) ---
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
  
  // 💡 NEW: Ref for ScrollView to enable auto-scroll
  const scrollViewRef = useRef(null); 

  // State remains the same
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  
  // useQuery remains the same
  const { loading, error, data, refetch } = useQuery(GET_MESSAGES, {
    variables: { room },
    skip: !username,
    fetchPolicy: "cache-and-network", // Ensure we always check for new data
  });
  
  // 💡 CRITICAL FIX: useMutation now uses refetchQueries to update the list
  const [sendMessageMutation] = useMutation(SEND_MESSAGE, {
    refetchQueries: [
      { query: GET_MESSAGES, variables: { room: room } },
    ],
  });

  // useEffect for initial message load
  useEffect(() => {
    if (data) {
      // Assuming your server returns messages newest-to-oldest, 
      // or at least in a consistent order. If you want oldest-to-newest, 
      // remove the .reverse() but consider setting inverted={true} on FlatList (if you re-add it).
      // Since we are now using ScrollView (which scrolls up), we keep the list newest-first.
      setMessages(data.messages ? data.messages.slice().reverse() : []);
    }
  }, [data]);

  // useEffect for chat initialization and socket setup (Logic remains the same)
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
      // ... (Socket connection logic remains the same)
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
        // Only append if the message wasn't sent by the current user 
        // (to avoid duplicates if the backend echoes the message)
        if (newMsg.sender.username !== username) { 
          setMessages((prev) => [newMsg, ...prev]);
        }
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

  // 💡 CRITICAL FIX: Removed manual state update and optimistic update
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    const messageContent = newMessage.trim();
    setNewMessage(""); // Clear input immediately for better UX

    try {
      const token = await AsyncStorage.getItem("token");

      // The mutation handles sending the data
      await sendMessageMutation({
        variables: {
          content: messageContent,
          room: room,
        },
        context: {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      });
      
      // The refetchQueries option on useMutation now automatically 
      // re-runs GET_MESSAGES, which updates the component via 'data'.
      
      // If your socket is still working for *other* users' messages, 
      // you might want to manually emit here to notify others faster 
      // than the refetch cycle:
      // if (socket) {
      //   socket.emit("send-message", { content: messageContent, room });
      // }

    } catch (err) {
      console.error("Send message error:", err);
      Alert.alert("Error", "Failed to send message");
      // No manual revert needed since we removed the manual optimistic update
    }
  };

  // ... (handleLogout and formatTimestamp remain the same) ...
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

      {/* 💡 FIX: Replaced FlatList with ScrollView */}
      <ScrollView
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContentContainer} // Used to push messages to bottom
        ref={scrollViewRef} // Reference for scrolling
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })} // Auto-scroll to end
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
      {/* ------------------------------------------- */}

      <View style={styles.inputContainer}>
        <RNTextInput
          style={[styles.messageInput, !socket && styles.messageInputDisabled]}
          placeholder={socket ? "Type a message..." : "Not connected..."}
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
          <Text style={styles.sendButtonText}>{socket ? "Send" : "Offline"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ----------------------------------------------------------------------
// --- Styles (Added messagesContentContainer) ---
// ----------------------------------------------------------------------
const styles = StyleSheet.create({
  // ... (Other styles remain the same) ...
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  // ... (Header and other styles) ...
  messagesList: {
    flex: 1,
  },
  // 💡 NEW STYLE: Forces the content to stick to the bottom
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
  // ... (Rest of styles) ...
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
  // ... (Rest of styles) ...
});
