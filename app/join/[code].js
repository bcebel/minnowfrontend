// app/join/[code].js - SIMPLIFIED VERSION
import React, { useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useLocalSearchParams, useRouter } from "expo-router";

// GraphQL Queries
const VALIDATE_INVITE_LINK = gql`
  query ValidateInviteLink($code: String!) {
    validateInviteLink(code: $code) {
      isValid
      message
      link {
        id
        code
        name
        maxUses
        uses
        expiresAt
        role
        isActive
        createdAt
      }
      neighborhood {
        id
        name
        description
        type
        owner {
          id
          username
          profilePhoto
        }
        memberCount
      }
    }
  }
`;

const REGISTER_AND_JOIN_VIA_LINK = gql`
  mutation RegisterAndJoinViaLink(
    $code: String!
    $username: String!
    $email: String!
    $password: String!
  ) {
    registerAndJoinViaLink(
      code: $code
      username: $username
      email: $email
      password: $password
    ) {
      token
      user {
        id
        username
        email
        profilePhoto
      }
    }
  }
`;

export default function JoinViaLinkScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const code = params.code;

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validate invite query
  const { loading, data, error } = useQuery(VALIDATE_INVITE_LINK, {
    variables: { code },
    skip: !code,
    fetchPolicy: "network-only",
  });

  // Register and join mutation
  const [registerAndJoin] = useMutation(REGISTER_AND_JOIN_VIA_LINK, {
    onCompleted: async (data) => {
      setIsSubmitting(false);
      Alert.alert(
        "Success! 🎉",
        `Welcome to ${neighborhood.name}! Your account has been created.`,
        [
          {
            text: "Continue",
            onPress: () => {
              // Save token to storage
              // Navigate to neighborhood or home
              router.replace(`/neighborhoods/${neighborhood.id}`);
            },
          },
        ]
      );
    },
    onError: (error) => {
      setIsSubmitting(false);
      Alert.alert("Error", error.message);
    },
  });

  const handleSubmit = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setIsSubmitting(true);

    try {
      await registerAndJoin({
        variables: {
          code,
          username: username.trim(),
          email: email.trim(),
          password,
        },
      });
    } catch (err) {
      setIsSubmitting(false);
      console.error("Registration error:", err);
    }
  };

  // Debug logging
  console.log("🔍 Join Screen Debug:", {
    code,
    loading,
    error: error?.message,
    data: data ? "Has data" : "No data",
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Checking invitation...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Invitation Error</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || !data.validateInviteLink) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>No Invitation Found</Text>
        <Text>The invitation link appears to be invalid or expired.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { validateInviteLink } = data;
  const { isValid, message, link, neighborhood } = validateInviteLink;

  if (!isValid) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Invalid Invitation</Text>
        <Text style={styles.errorMessage}>{message}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // MAIN FORM SCREEN
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Join {neighborhood.name}</Text>
        <Text style={styles.subtitle}>
          You've been invited to join this neighborhood
        </Text>
      </View>

      <View style={styles.neighborhoodCard}>
        <Text style={styles.neighborhoodName}>{neighborhood.name}</Text>
        {neighborhood.description && (
          <Text style={styles.neighborhoodDescription}>
            {neighborhood.description}
          </Text>
        )}
        <View style={styles.statsRow}>
          <Text style={styles.stat}>👥 {neighborhood.memberCount} members</Text>
          <Text style={styles.stat}>🎭 {link.role} role</Text>
        </View>
      </View>

      <View style={styles.formSection}>
        <Text style={styles.formTitle}>Create Your Account</Text>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          placeholder="Choose a username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Your email address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="At least 6 characters"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity
          style={[
            styles.submitButton,
            isSubmitting && styles.submitButtonDisabled,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitButtonText}>
              Join {neighborhood.name}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          By joining, you agree to our Terms of Service and Privacy Policy
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FF3B30",
    marginBottom: 10,
    textAlign: "center",
  },
  errorMessage: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
    textAlign: "center",
    lineHeight: 22,
  },
  header: {
    alignItems: "center",
    marginBottom: 30,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1A1A1A",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  neighborhoodCard: {
    backgroundColor: "#F8F9FA",
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  neighborhoodName: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#212529",
    marginBottom: 8,
  },
  neighborhoodDescription: {
    fontSize: 15,
    color: "#495057",
    marginBottom: 15,
    lineHeight: 22,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
  },
  stat: {
    fontSize: 14,
    color: "#6C757D",
  },
  formSection: {
    marginBottom: 30,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#212529",
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#212529",
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CED4DA",
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
  },
  submitButton: {
    backgroundColor: "#007AFF",
    borderRadius: 10,
    padding: 18,
    alignItems: "center",
    marginTop: 30,
  },
  submitButtonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "600",
  },
  button: {
    backgroundColor: "#007AFF",
    borderRadius: 10,
    padding: 15,
    alignItems: "center",
    marginTop: 20,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  footer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
  },
  footerText: {
    fontSize: 12,
    color: "#6C757D",
    textAlign: "center",
    lineHeight: 18,
  },
});
