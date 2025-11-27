import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { Text } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const RegistrationScreen = () => {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async () => {
    if (!username || !email || !password) {
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
            mutation RegisterUser($username: String!, $email: String!, $password: String!) {
              registerUser(username: $username, email: $email, password: $password) {
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
          variables: { username, email, password },
        }),
      });

      const data = await response.json();
      console.log("Registration response:", data); // Debug log

      // ✅ FIXED: Check for GraphQL response structure
      if (data.data?.registerUser?.token) {
        const token = data.data.registerUser.token;
        const user = data.data.registerUser.user;

        // Auto-login after registration
        await AsyncStorage.setItem("token", token);
        await AsyncStorage.setItem("username", user.username);

        console.log("✅ Registration - Token saved to AsyncStorage");
        console.log("✅ Registration - Username saved:", user.username);

        Alert.alert(
          "Welcome!",
          `🎉 Welcome to the club, ${user.username}! You've been automatically logged in.`
        );
        router.replace("/(tabs)/neighborhoods"); // Use replace so they can't go back to registration
      } else {
        // Handle GraphQL errors
        const errorMessage =
          data.errors?.[0]?.message ||
          data.error ||
          "Registration failed. Please try again.";
        Alert.alert("Error", errorMessage);
      }
    } catch (error) {
      console.error("Registration error:", error);
      Alert.alert("Error", "Network error. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>Join the Neighborhood</Text>
          <Text style={styles.subtitle}>
            Create your space in the digital community
          </Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Username</Text>
            <RNTextInput
              style={styles.input}
              placeholder="Choose a username"
              placeholderTextColor="#888"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Email</Text>
            <RNTextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <RNTextInput
              style={styles.input}
              placeholder="Create a password"
              placeholderTextColor="#888"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              onSubmitEditing={handleRegister}
            />
          </View>

          <TouchableOpacity
            style={[styles.button, isLoading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>
              {isLoading ? "Creating Account..." : "Create Account"}
            </Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/login")}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.features}>
          <Text style={styles.featuresTitle}>What you get:</Text>
          <Text style={styles.feature}>🏠 Your own digital neighborhood</Text>
          <Text style={styles.feature}>🎪 Live stream with friends</Text>
          <Text style={styles.feature}>💎 Monetize with affiliate links</Text>
          <Text style={styles.feature}>🔒 Control your privacy</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    justifyContent: "center",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00ffff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#00AA00",
    textAlign: "center",
    opacity: 0.8,
  },
  form: {
    marginBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 16,
    color: "#00ffff",
    marginBottom: 8,
    fontWeight: "600",
  },
  input: {
    borderWidth: 2,
    borderColor: "#00ffff",
    borderRadius: 12,
    backgroundColor: "#111111",
    padding: 15,
    fontSize: 16,
    color: "#00ffff",
  },
  button: {
    backgroundColor: "#00ffff",
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
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    color: "#00AA00",
    fontSize: 16,
  },
  linkText: {
    color: "#00ffff",
    fontWeight: "bold",
    fontSize: 16,
  },
  features: {
    marginTop: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: "#00ffff",
    borderRadius: 8,
    backgroundColor: "#111111",
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 10,
  },
  feature: {
    fontSize: 16,
    color: "#00AA00",
    marginBottom: 8,
  },
});

export default RegistrationScreen;
