import { useRouter, useLocalSearchParams } from "expo-router";
import React from "react";
import { View, Text, Image, StyleSheet, TouchableOpacity } from "react-native";

const MEMBERS = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `User${i + 1}`,
  bio: `Short bio for User${i + 1}.`,
  avatar: `https://i.pravatar.cc/150?img=${i + 1}`,
  links: ["https://example.com", "https://twitter.com"],
}));

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams();
  const user = MEMBERS.find((member) => member.id === parseInt(userId));

  if (!user) {
    return <Text>User not found</Text>;
  }

  return (
    <View style={styles.container}>
      <Image source={{ uri: user.avatar }} style={styles.avatar} />
      <Text style={styles.name}>{user.name}</Text>
      <Text style={styles.bio}>{user.bio}</Text>
      <View style={styles.linksContainer}>
        {user.links.map((link, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => console.log(`Opening link: ${link}`)}
          >
            <Text style={styles.link}>🔗 Link {index + 1}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
  },
  name: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 10,
  },
  bio: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  linksContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  link: {
    fontSize: 14,
    color: "#007bff",
    marginHorizontal: 5,
  },
});
