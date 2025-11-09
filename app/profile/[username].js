// app/profile/[username].js
import { useLocalSearchParams } from "expo-router";
import { View, Text, Image, StyleSheet } from "react-native";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams();

  // For now, just show basic info - later you can query user data
  return (
    <View style={styles.container}>
      <Image
        source={{
          uri:
            "https://ui-avatars.com/api/?name=" +
            username +
            "&background=00FF00&color=000",
        }}
        style={styles.avatar}
      />
      <Text style={styles.username}>@{username}</Text>
      <Text style={styles.bio}></Text> {/* Hardcoded for now */}
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
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 20,
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
  },
});
