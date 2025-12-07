// app/join/[code].js - COMPLETE REPLACEMENT
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
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../context/authProvider";

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
        createdBy {
          id
          username
          profilePhoto
        }
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

const JOIN_VIA_INVITE_LINK = gql`
  mutation JoinViaInviteLink($code: String!) {
    joinViaInviteLink(code: $code) {
      success
      message
      error
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

export default function InviteScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { isAuthenticated, login } = useAuth(); // Get auth state

  const code = params.code;
  const [step, setStep] = useState("validate"); // 'validate', 'register', 'success', 'login'
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
  });
  const [loginFormData, setLoginFormData] = useState({
    username: "",
    password: "",
  });

  // Validate invite query
  const { loading, data, error, refetch } = useQuery(VALIDATE_INVITE_LINK, {
    variables: { code },
    skip: !code,
    fetchPolicy: "network-only",
    onCompleted: (data) => {
      if (data?.validateInviteLink?.isValid) {
        if (isAuthenticated) {
          // If already logged in, skip to success step
          setStep("authenticated");
        }
      }
    },
  });

  // Register and join mutation
  const [registerAndJoin, { loading: registering }] = useMutation(
    REGISTER_AND_JOIN_VIA_LINK,
    {
      onCompleted: async (data) => {
        // Save the token and login
        await login(data.registerAndJoinViaLink.token);
        setStep("success");
      },
      onError: (error) => {
        Alert.alert("Registration Error", error.message);
      },
    }
  );

  // Join mutation (for already authenticated users)
  const [joinViaInviteLink, { loading: joining }] = useMutation(
    JOIN_VIA_INVITE_LINK,
    {
      onCompleted: (data) => {
        if (data.joinViaInviteLink.success) {
          setStep("success");
        } else {
          Alert.alert("Error", data.joinViaInviteLink.message);
        }
      },
      onError: (error) => {
        Alert.alert("Error", error.message);
      },
    }
  );

  const handleRegisterAndJoin = async () => {
    if (!formData.username || !formData.email || !formData.password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (formData.password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    try {
      await registerAndJoin({
        variables: {
          code,
          username: formData.username,
          email: formData.email,
          password: formData.password,
        },
      });
    } catch (err) {
      console.error("Registration error:", err);
    }
  };

  const handleJoinAsAuthenticated = async () => {
    try {
      await joinViaInviteLink({
        variables: { code },
      });
    } catch (err) {
      console.error("Join error:", err);
    }
  };

  const handleLoginAndJoin = async () => {
    // You'll need to implement login mutation
    // For now, let's assume login() handles it
    await login(loginFormData.username, loginFormData.password);
    // After login, refetch to update UI
    refetch();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Checking your invitation...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Invitation Error</Text>
        <Text style={styles.errorMessage}>{error.message}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!data || !data.validateInviteLink) {
    return (
      <View style={styles.container}>
        <Text>No invitation data received</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { validateInviteLink } = data;
  const { isValid, message, link, neighborhood } = validateInviteLink;

  if (!isValid) {
    return (
      <View style={styles.container}>
        <Text style={styles.invalidTitle}>Invalid Invitation</Text>
        <Text style={styles.invalidMessage}>{message}</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Render different steps
  const renderStep = () => {
    switch (step) {
      case "validate":
      case "authenticated":
        return (
          <View style={styles.stepContainer}>
            <View style={styles.invitationHeader}>
              <Text style={styles.title}>You're Invited! 🎉</Text>
              <Text style={styles.subtitle}>
                {link.createdBy?.username || "Someone"} has invited you to join
              </Text>
            </View>

            <View style={styles.neighborhoodCard}>
              <Text style={styles.neighborhoodName}>{neighborhood.name}</Text>
              <Text style={styles.neighborhoodDescription}>
                {neighborhood.description || "A private neighborhood community"}
              </Text>
              <View style={styles.neighborhoodStats}>
                <Text style={styles.stat}>
                  👥 {neighborhood.memberCount} members
                </Text>
                <Text style={styles.stat}>🎭 {link.role} role</Text>
              </View>
            </View>

            <View style={styles.inviteDetails}>
              <Text style={styles.detailsTitle}>Invitation Details</Text>
              <Text>From: {link.createdBy?.username || "Anonymous"}</Text>
              <Text>Invite: {link.name}</Text>
              {link.expiresAt && (
                <Text>
                  Expires: {new Date(link.expiresAt).toLocaleDateString()}
                </Text>
              )}
              <Text>
                Uses: {link.uses}/{link.maxUses || "∞"}
              </Text>
            </View>

            {isAuthenticated ? (
              <View style={styles.authActions}>
                <Text style={styles.welcomeText}>
                  Welcome back, {user?.username}!
                </Text>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    joining && styles.buttonDisabled,
                  ]}
                  onPress={handleJoinAsAuthenticated}
                  disabled={joining}
                >
                  {joining ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      Accept Invitation
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.authActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => setStep("register")}
                >
                  <Text style={styles.actionButtonText}>
                    Create Account & Join
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setStep("login")}
                >
                  <Text style={styles.secondaryButtonText}>
                    Already have an account? Log in
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        );

      case "register":
        return (
          <KeyboardAvoidingView
            style={styles.stepContainer}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.stepTitle}>Create Your Account</Text>
              <Text style={styles.stepSubtitle}>
                Join {neighborhood.name} as {link.role}
              </Text>

              <View style={styles.form}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Choose a username"
                  value={formData.username}
                  onChangeText={(text) =>
                    setFormData({ ...formData, username: text })
                  }
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your email address"
                  value={formData.email}
                  onChangeText={(text) =>
                    setFormData({ ...formData, email: text })
                  }
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={styles.label}>Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="At least 6 characters"
                  value={formData.password}
                  onChangeText={(text) =>
                    setFormData({ ...formData, password: text })
                  }
                  secureTextEntry
                />

                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    registering && styles.buttonDisabled,
                  ]}
                  onPress={handleRegisterAndJoin}
                  disabled={registering}
                >
                  {registering ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <Text style={styles.actionButtonText}>
                      Create Account & Join
                    </Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setStep("validate")}
                >
                  <Text style={styles.secondaryButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        );

      case "login":
        return (
          <KeyboardAvoidingView
            style={styles.stepContainer}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Text style={styles.stepTitle}>Log In</Text>
            <Text style={styles.stepSubtitle}>
              Log in to accept your invitation to {neighborhood.name}
            </Text>

            <View style={styles.form}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Your username"
                value={loginFormData.username}
                onChangeText={(text) =>
                  setLoginFormData({ ...loginFormData, username: text })
                }
                autoCapitalize="none"
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Your password"
                value={loginFormData.password}
                onChangeText={(text) =>
                  setLoginFormData({ ...loginFormData, password: text })
                }
                secureTextEntry
              />

              <TouchableOpacity
                style={styles.actionButton}
                onPress={handleLoginAndJoin}
              >
                <Text style={styles.actionButtonText}>
                  Log In & Accept Invitation
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setStep("validate")}
              >
                <Text style={styles.secondaryButtonText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.textButton}
                onPress={() => setStep("register")}
              >
                <Text style={styles.textButtonText}>
                  Don't have an account? Create one
                </Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        );

      case "success":
        return (
          <View style={styles.stepContainer}>
            <View style={styles.successContainer}>
              <Text style={styles.successEmoji}>🎉</Text>
              <Text style={styles.successTitle}>Welcome Aboard!</Text>
              <Text style={styles.successMessage}>
                You've successfully joined {neighborhood.name} as a {link.role}
              </Text>

              <TouchableOpacity
                style={styles.successButton}
                onPress={() => router.push(`/neighborhoods/${neighborhood.id}`)}
              >
                <Text style={styles.successButtonText}>Go to Neighborhood</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => router.push("/")}
              >
                <Text style={styles.secondaryButtonText}>Go Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
    }
  };

  return <View style={styles.container}>{renderStep()}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFF",
  },
  stepContainer: {
    flex: 1,
    padding: 20,
  },
  loadingText: {
    marginTop: 20,
    fontSize: 16,
    color: "#666",
    textAlign: "center",
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
  },
  invalidTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FF3B30",
    marginBottom: 10,
    textAlign: "center",
  },
  invalidMessage: {
    fontSize: 16,
    color: "#666",
    marginBottom: 30,
    textAlign: "center",
  },
  backButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  backButtonText: {
    color: "#007AFF",
    fontSize: 16,
    fontWeight: "600",
  },
  invitationHeader: {
    alignItems: "center",
    marginBottom: 30,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
  },
  neighborhoodCard: {
    backgroundColor: "#F8F9FA",
    padding: 20,
    borderRadius: 15,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E9ECEF",
  },
  neighborhoodName: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#212529",
  },
  neighborhoodDescription: {
    fontSize: 16,
    color: "#495057",
    marginBottom: 15,
  },
  neighborhoodStats: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
  },
  stat: {
    fontSize: 14,
    color: "#6C757D",
  },
  inviteDetails: {
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: "#DEE2E6",
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 10,
    color: "#212529",
  },
  authActions: {
    marginTop: 20,
  },
  welcomeText: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
    color: "#495057",
  },
  actionButton: {
    backgroundColor: "#007AFF",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 15,
  },
  buttonDisabled: {
    backgroundColor: "#CCCCCC",
  },
  actionButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
  secondaryButton: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  secondaryButtonText: {
    color: "#007AFF",
    fontSize: 16,
  },
  textButton: {
    padding: 10,
    alignItems: "center",
  },
  textButtonText: {
    color: "#007AFF",
    fontSize: 14,
  },
  stepTitle: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
    color: "#212529",
  },
  stepSubtitle: {
    fontSize: 16,
    color: "#6C757D",
    marginBottom: 30,
  },
  form: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 8,
    color: "#212529",
  },
  input: {
    borderWidth: 1,
    borderColor: "#CED4DA",
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    marginBottom: 20,
    backgroundColor: "#FFF",
  },
  successContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  successEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  successTitle: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 15,
    textAlign: "center",
  },
  successMessage: {
    fontSize: 18,
    color: "#495057",
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 24,
  },
  successButton: {
    backgroundColor: "#007AFF",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 15,
    width: "100%",
  },
  successButtonText: {
    color: "#FFF",
    fontSize: 18,
    fontWeight: "600",
  },
});
