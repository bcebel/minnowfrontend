// app/profile/[username].js
import { useLocalSearchParams } from "expo-router";
import { View, Text, Image, StyleSheet, ActivityIndicator } from "react-native";
import { useQuery } from "@apollo/client";
import { GET_USER } from "./graphql/queries";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams();
  const { loading, error, data } = useQuery(GET_USER, {
    variables: { username },
  });

  if (loading) return <ActivityIndicator size="large" style={styles.loading} />;
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  const user = data?.user;
  if (!user) return <Text style={styles.error}>User not found</Text>;

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri:
            user.profilePhoto ||
            `https://ui-avatars.com/api/?name=${username}&background=00FF00&color=000`,
        }}
        style={styles.avatar}
      />
      <Text style={styles.username}>@{user.username}</Text>

      {user.bio ? (
        <View style={styles.bioSection}>
          <Text style={styles.bioLabel}>About</Text>
          <Text style={styles.bio}>{user.bio}</Text>
        </View>
      ) : (
        <Text style={styles.noBio}>No bio yet</Text>
      )}

      <Text style={styles.memberSince}>
        Member since {new Date(user.createdAt).toLocaleDateString()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#000",
    alignItems: "center",
  },
  loading: {
    marginTop: 50,
  },
  error: {
    color: "#FF4444",
    textAlign: "center",
    marginTop: 20,
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: "#00FF00",
  },
  username: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 20,
  },
  bioSection: {
    backgroundColor: "#111",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
    width: "100%",
    marginBottom: 20,
  },
  bioLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 10,
  },
  bio: {
    fontSize: 16,
    color: "#CCC",
    lineHeight: 22,
  },
  noBio: {
    fontSize: 16,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 20,
  },
  memberSince: {
    fontSize: 14,
    color: "#00AA00",
  },
  // Add to your HomeScreen styles
  createButton: {
    backgroundColor: "#333",
    borderWidth: 2,
    borderColor: "#00FF00",
    borderStyle: "dashed",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  createButtonText: {
    color: "#00FF00",
    fontSize: 16,
    fontWeight: "bold",
  },
});
