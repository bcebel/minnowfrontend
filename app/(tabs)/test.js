import { Link } from "expo-router";
import React from "react";
import {
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
} from "react-native";

const MEMBERS = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `User${i + 1}`,
  bio: `Short bio for User${i + 1}.`,
  avatar: `https://i.pravatar.cc/150?img=${i + 1}`,
  links: ["https://example.com", "https://twitter.com"],
}));

export default function HomeScreen() {
  const renderItem = ({ item }) => (
    <Link href={`/${item.id}`} asChild>
      <TouchableOpacity style={styles.userItem}>
        <Text style={styles.userName}>{item.name}</Text>
      </TouchableOpacity>
    </Link>
  );

  return (
    <FlatList
      data={MEMBERS}
      keyExtractor={(item) => item.id.toString()}
      renderItem={renderItem}
    />
  );
}

const styles = StyleSheet.create({
  userItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  userName: {
    fontSize: 18,
    fontWeight: "bold",
  },
});
