// frontend/App.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Image,
  StyleSheet,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WelcomeScreen from "../../components/WelcomeScreen"; // Adjust the path based on your file structure
import { useNavigation } from "@react-navigation/native";
const Stack = createNativeStackNavigator();
const BACKEND_URL = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com"; // Change this to your backend URL

// Socket.io connection with auth
const setupSocket = (token) => {
  const socket = io(BACKEND_URL, {
    auth: { token },
  });
  return socket;
};

// Auth Context
const AuthContext = React.createContext();

export function AuthProvider({ children, navigation }) {
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Load token from storage on app start
    AsyncStorage.getItem("token").then((savedToken) => {
      if (savedToken) {
        setToken(savedToken);
        setSocket(setupSocket(savedToken));
      }
    });
  }, []);

  const login = async (username, password, navigation) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "https://minnowspacexpo.vercel.app",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS, PUT, DELETE",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.token) {
        await AsyncStorage.setItem("token", data.token);
        setToken(data.token);
        setSocket(setupSocket(data.token));

        // Navigate to Welcome
        navigation.navigate("Welcome");
      }
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem("token");
    setToken(null);
    if (socket) socket.disconnect();
    setSocket(null);
  };

  return (
    <AuthContext.Provider value={{ token, socket, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Login Screen
function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const { login } = React.useContext(AuthContext);

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
      />
      <Button
        title="Login"
        onPress={() => login(username, password, navigation)}
      />
    </View>
  );
}

// Message Input Component
function MessageInput({ onSend }) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim()) {
      onSend(message);
      setMessage("");
    }
  };

  return (
    <View style={styles.inputContainer}>
      <TextInput
        value={message}
        onChangeText={setMessage}
        style={styles.messageInput}
        placeholder="Type a message..."
      />
      <Button title="Send" onPress={handleSend} />
    </View>
  );
}

// Chat Screen
function ChatScreen({ route }) {
  const { socket, token } = React.useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const { room } = route.params || { room: "general" }; // Default to 'general' room if none specified

  useEffect(() => {
    if (socket) {
      socket.emit("join-room", room);

      socket.on("message", (newMessage) => {
        setMessages((prev) => [newMessage, ...prev]);
      });

      // Load previous messages
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

  const sendMessage = (content, imageUrl = null) => {
    if (socket) {
      socket.emit("message", { content, imageUrl, room });
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.messageContainer}>
            <Text style={styles.username}>{item.sender.username}</Text>
            <Text>{item.content}</Text>
            {item.imageUrl && (
              <Image
                source={{ uri: item.imageUrl }}
                style={styles.messageImage}
              />
            )}
          </View>
        )}
      />
      <MessageInput onSend={sendMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
    backgroundColor: "#fff",
  },
  input: {
    height: 40,
    borderColor: "gray",
    borderWidth: 1,
    marginBottom: 10,
    padding: 10,
    borderRadius: 5,
  },
  messageContainer: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  username: {
    fontWeight: "bold",
    marginBottom: 5,
    color: "#2b5876",
  },
  messageImage: {
    width: 200,
    height: 200,
    marginTop: 10,
    borderRadius: 10,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  messageInput: {
    flex: 1,
    marginRight: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 5,
  },
});

export default function App() {
  const navigation = useNavigation();
  return (
    <AuthProvider navigation={navigation}>
      <Stack.Navigator>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </AuthProvider>
  );
}
