// frontend/App.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableHighlight,
  TextInput,
  Button,
  FlatList,
  Image,
  StyleSheet,
} from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import WelcomeScreen from "../../components/WelcomeScreen";
import RegistrationScreen from "../../components/RegistrationScreen";
import Imagein from "../../components/ImagePicker";
import AmpComponent from "./YouTube";
// Adjust path based on your file structure

const Stack = createNativeStackNavigator();
const BACKEND_URL = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com"; // Change this to your backend URL

// Socket.io connection setup
const setupSocket = (token) => {
  const socket = io(BACKEND_URL, {
    auth: { token },
  });
  return socket;
};

// Auth Context
const AuthContext = React.createContext();

// AuthProvider Component
export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Retrieve token from storage when the app starts
    AsyncStorage.getItem("token").then((savedToken) => {
      console.log("Retrieved token:", savedToken); // Debug statement
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      console.log("Setting token after login:", data.token); // Debug statement
      if (data.token) {
        await AsyncStorage.setItem("token", data.token);
        setToken(data.token);
        setSocket(setupSocket(data.token));
        navigation.navigate("Chat");
      } else {
        console.error("Invalid credentials or token missing");
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

  const handleLogin = () => {
    if (username && password) {
      login(username, password, navigation);
    } else {
      console.error("Please enter username and password");
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Username"
        placeholderTextColor="#888"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        style={styles.input}
        onSubmitEditing={handleLogin}
      />
      <Button title="Login" onPress={handleLogin} />
      <RegistrationScreen />
    </View>
  );
}

// Chat Screen
function ChatScreen({ route }) {
  const { socket, token } = React.useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
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

  const sendMessage = (content, imageUrl = null) => {
    if (socket && (content.trim() || imageUrl)) {
      socket.emit("message", { content, imageUrl, room });
    }
  };

  const handleSendMessage = () => {
    sendMessage(newMessage);
    setNewMessage("");
  };

  const handleImageSelected = (imageUri) => {
    sendMessage("", imageUri); // Send the image URI as a message
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
      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Type a message..."
          
          style={styles.messageInput}
          value={newMessage}
          onChangeText={setNewMessage}
        />
        <Imagein onImageSelected={handleImageSelected} />

        <Button title="Send" onPress={handleSendMessage} />
      </View>
    </View>
  );
}
// App Component
export default function App() {
  return (
    <AuthProvider>
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