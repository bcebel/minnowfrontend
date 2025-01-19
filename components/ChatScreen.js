import React, { useEffect, useState } from "react";
import {
  View,
  FlatList,
  Text,
  TextInput,
  Button,
  StyleSheet,
} from "react-native";
import { AuthContext } from "../context/uthProvider";

const BACKEND_URL = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com";

export default function ChatScreen({ route }) {
  const { socket, token } = React.useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const { room } = route.params || { room: "general" };

  useEffect(() => {
    if (socket) {
      socket.emit("join-room", room);

      socket.on("message", (newMessage) => {
        setMessages((prev) => [newMessage, ...prev]);
      });

      fetch(`${BACKEND_URL}/api/messages/${room}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => setMessages(data))
        .catch(console.error);

      return () => {
        socket.emit("leave-room", room);
        socket.off("message");
      };
    }
  }, [socket, room]);

  const sendMessage = (content) => {
    if (socket && content.trim()) {
      socket.emit("message", { content, room });
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.messageContainer}>
            <Text>{item.content}</Text>
          </View>
        )}
      />
      <TextInput
        placeholder="Type a message..."
        onSubmitEditing={(e) => sendMessage(e.nativeEvent.text)}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  input: {
    height: 40,
    borderWidth: 1,
    padding: 10,
  },
});
