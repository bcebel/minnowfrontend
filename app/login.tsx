import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function LoginScreen() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${BACKEND_URL}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `
          mutation LoginUser($username: String!, $password: String!) {
            loginUser(username: $username, password: $password) {
              token
              user {
                id
                username
                email
                profilePhoto
              }
            }
          }
        `,
          variables: { username, password },
        }),
      });

      const data = await response.json();
      console.log("✅ Login response:", data);

      if (data.data?.loginUser?.token) {
        const token = data.data.loginUser.token;
        const user = data.data.loginUser.user;

        // ✅ CRITICAL: Save token and username to AsyncStorage
        await AsyncStorage.setItem("token", token);
        await AsyncStorage.setItem("username", user.username);

        console.log(
          "✅ Token saved to AsyncStorage:",
          token.substring(0, 20) + "..."
        );
        console.log("✅ Username saved:", user.username);

        Alert.alert("Success", `Welcome back, ${user.username}!`);
        router.replace("/(tabs)/neighborhoods"); // Use replace so they can't go back to login
      } else {
        const errorMessage = data.errors?.[0]?.message || "Login failed";
        Alert.alert("Error", errorMessage);
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign In</Text>
      <Text style={styles.subtitle}>Enter your neighborhood</Text>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.label}>Username</Text>
          <RNTextInput
            style={styles.input}
            placeholder="Enter your username"
            placeholderTextColor="#888"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <RNTextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#888"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            onSubmitEditing={handleLogin}
          />
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Signing In..." : "Sign In"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push("/register")}
        >
          <Text style={styles.linkText}>New here? Create an account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#000000",
    justifyContent: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#00FF00",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#00AA00",
    textAlign: "center",
    marginBottom: 40,
    opacity: 0.8,
  },
  form: {
    marginHorizontal: 10,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    color: "#00FF00",
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    borderWidth: 2,
    borderColor: "#00FF00",
    borderRadius: 12,
    backgroundColor: "#111111",
    padding: 15,
    fontSize: 16,
    color: "#00FF00",
  },
  button: {
    backgroundColor: "#00FF00",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#000000",
    fontSize: 18,
    fontWeight: "bold",
  },
  linkButton: {
    padding: 15,
    alignItems: "center",
    marginTop: 20,
  },
  linkText: {
    color: "#00FF00",
    fontSize: 16,
    fontWeight: "600",
  },
});
