// frontend/App.js
import React, { useState, useEffect } from "react";
import {
  View,
  TouchableHighlight,
  TouchableOpacity,
  FlatList,
  Image,
  StyleSheet,
  ImageBackground,
} from "react-native";
import { Text, Modal, Portal, PaperProvider } from "react-native-paper";
import Background from "../../components/Background";
import Logo from "../../components/Logo";
import Header from "../../components/Header";
import Button from "../../components/Button";
import TextInput from "../../components/TextInput";
import BackButton from "../../components/BackButton";
import theme from "../../app/core/theme";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import RegistrationScreen from "../../app/RegistrationScreen";
import Imagein from "../../components/ImagePicker";
import { passwordValidator } from "../../app/helpers/passwordValidator";
// Adjust path based on your file structure
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const Stack = createNativeStackNavigator();

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
    <Background>
      <BackButton goBack={navigation.goBack} />
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
        <Button title="Login" mode="outlined" onPress={handleLogin}>
          <Text>login</Text>
        </Button>
        <RegistrationScreen />
      </View>
    </Background>
  );
}

// Chat Screen
function ChatScreen({ route }) {
  const { socket, token } = React.useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const { room } = route.params || { room: "general" };
  const [visible, setVisible] = React.useState(false);
  const showModal = () => setVisible(true);
  const hideModal = () => setVisible(false);
  const containerStyle = { backgroundColor: "white", padding: 20 };

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
          <View>
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
        <Imagein onImageSelected={handleImageSelected} />
      </View>
      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Type a message..."
          style={styles.messageInput}
          value={newMessage}
          onChangeText={setNewMessage}
          onSubmitEditing={handleSendMessage}
        />
      </View>
      <Button title="Send" onPress={handleSendMessage} />
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
    marginBottom: 10,
    padding: 2,
    borderRadius: 5,
  },
  messageContainer: {
    padding: 2,
    borderBottomColor: "#eee",
  },
  username: {
    fontWeight: "bold",
    marginBottom: 5,
  },
  messageImage: {
    width: 200,
    height: 200,
    marginTop: 5,
    borderRadius: 10,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 5,
    height: 75,
  },
  messageInput: {
    flex: 1,
    height: 40,
    marginRight: 20,
    padding: 5,
    borderRadius: 5,
  },
  forgotPassword: {
    width: "100%",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    marginTop: 4,
  },
  forgot: {
    fontSize: 13,
    color: theme.colors.secondary,
  },
  link: {
    fontWeight: "bold",
    color: theme.colors.primary,
  },
});
