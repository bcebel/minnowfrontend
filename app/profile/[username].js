// app/profile/[username].js
import { useLocalSearchParams } from "expo-router";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useQuery, gql } from "@apollo/client";

// Now use the efficient query that hits the database directly
const GET_USER_BY_USERNAME = gql`
  query GetUserByUsername($username: String!) {
    userByUsername(username: $username) {
      id
      username
      profilePhoto
      bio
      createdAt
    }
  }
`;

export default function ProfileScreen() {
  const { username } = useLocalSearchParams();

  // Use the efficient query - database does the filtering!
  const { loading, error, data } = useQuery(GET_USER_BY_USERNAME, {
    variables: { username },
  });

  if (loading) return <ActivityIndicator size="large" color="#00FF00" />;

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>Error loading profile</Text>
        <Text style={styles.tip}>{error.message}</Text>
      </View>
    );
  }

  const user = data?.userByUsername;

  if (!user) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>User @{username} not found</Text>
        <Text style={styles.tip}>
          This username doesn't exist in our system.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri:
            user.profilePhoto ||
            `https://ui-avatars.com/api/?name=${user.username}&background=00FF00&color=000`,
        }}
        style={styles.avatar}
      />
      <Text style={styles.username}>@{user.username}</Text>
      <Text style={styles.bio}>
        {user.bio || "This user hasn't written a bio yet."}
      </Text>

      {/* User stats - you can add these later */}
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Posts</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Videos</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>0</Text>
          <Text style={styles.statLabel}>Neighborhoods</Text>
        </View>
      </View>
    </View>
  );
}

// Keep your same styles...
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#000",
    alignItems: "center",
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#00FF00",
  },
  username: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 10,
  },
  bio: {
    fontSize: 16,
    color: "#CCC",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 30,
    maxWidth: 300,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
    maxWidth: 300,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 20,
  },
  stat: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: "#888",
  },
  error: {
    color: "#FF4444",
    textAlign: "center",
    marginTop: 50,
    fontSize: 18,
    marginBottom: 10,
  },
  tip: {
    color: "#00AA00",
    textAlign: "center",
    marginTop: 20,
    fontSize: 14,
    maxWidth: 300,
  },
});
