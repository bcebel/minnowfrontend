import React, { useState, useEffect } from "react";
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
} from "react-native";
import { Text } from "react-native";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function ChatScreen() {
  const params = useLocalSearchParams();
  const room = params.room || "general";

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const initializeChat = async () => {
      const token = await AsyncStorage.getItem("token");

      if (token) {
        const newSocket = io(BACKEND_URL, {
          auth: { token },
          transports: ["websocket"],
        });

        setSocket(newSocket);

        newSocket.emit("join-room", room);
        newSocket.on("message", (newMsg) => {
          setMessages((prev) => [newMsg, ...prev]);
        });

        // Load existing messages
        try {
          const response = await fetch(`${BACKEND_URL}/api/messages/${room}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await response.json();
          setMessages(data.reverse()); // Reverse to show newest first
        } catch (error) {
          console.error("Failed to load messages:", error);
        }
      }
    };

    initializeChat();

    return () => {
      if (socket) {
        socket.emit("leave-room", room);
        socket.disconnect();
      }
    };
  }, [room]);

  const sendMessage = () => {
    if (socket && newMessage.trim()) {
      socket.emit("message", {
        content: newMessage.trim(),
        room,
      });
      setNewMessage("");
    }
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.roomTitle}>💬 {room} Chat</Text>

      <FlatList
        data={messages}
        keyExtractor={(item) => item._id || Math.random().toString()}
        renderItem={({ item }) => (
          <View style={styles.messageContainer}>
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
              <Text style={styles.messageText}>{item.content}</Text>
              {item.imageUrl && (
                <Image
                  source={{ uri: item.imageUrl }}
                  style={styles.messageImage}
                />
              )}
              <Text style={styles.timestamp}>
                {formatTimestamp(item.createdAt)}
              </Text>
            </View>
          </View>
        )}
        style={styles.messagesList}
      />

      <View style={styles.inputContainer}>
        <RNTextInput
          style={styles.messageInput}
          placeholder="Type a message..."
          placeholderTextColor="#888"
          value={newMessage}
          onChangeText={setNewMessage}
          onSubmitEditing={sendMessage}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !newMessage.trim() && styles.sendButtonDisabled,
          ]}
          onPress={sendMessage}
          disabled={!newMessage.trim()}
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
  roomTitle: {
    fontSize: 18,
    color: "#00FF00",
    textAlign: "center",
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#00FF00",
    backgroundColor: "#111111",
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
