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

// Define separate styles for light and dark themes
const themeStyles = {
  light: StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 20,
      backgroundColor: "#FFFFFF",
    },
    header: {
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 8,
      color: "#000000",
    },
    subtitle: {
      fontSize: 14,
      textAlign: "center",
      marginBottom: 20,
      opacity: 0.8,
      color: "#333333",
    },
    userItem: {
      padding: 15,
      // REMOVE or CHANGE these border properties:
      // borderBottomWidth: 1,
      // borderBottomColor: "#FF0000",
      marginHorizontal: 10,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: "#FFFFFF",
      // Add a subtle shadow or different separator instead:
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1,
      elevation: 1,
    },
    userName: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 4,
      color: "#000000",
    },
    userBio: {
      fontSize: 14,
      opacity: 0.7,
      color: "#333333",
    },
  }),
  dark: StyleSheet.create({
    container: {
      flex: 1,
      paddingTop: 20,
      backgroundColor: "#000000",
    },
    header: {
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      marginBottom: 8,
      color: "#00FF00",
    },
    subtitle: {
      fontSize: 14,
      textAlign: "center",
      marginBottom: 20,
      opacity: 0.8,
      color: "#00AA00",
    },
    userItem: {
      padding: 15,
      // REMOVE or CHANGE these border properties:
      // borderBottomWidth: 1,
      // borderBottomColor: "#00FF00",
      marginHorizontal: 10,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: "#000000",
      // Add a subtle border instead:
      borderWidth: 1,
      borderColor: "#333333",
    },
    userName: {
      fontSize: 18,
      fontWeight: "bold",
      marginBottom: 4,
      color: "#00FF00",
    },
    userBio: {
      fontSize: 14,
      opacity: 0.7,
      color: "#00AA00",
    },
  }),
};

export default function HomeScreen() {
  // For now, let's use light theme to avoid complexity
  // You can add proper theme switching later
  const styles = themeStyles.light;

  const renderItem = ({ item }) => (
    <Link href={`/${item.id}`} asChild>
      <TouchableOpacity style={styles.userItem}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userBio}>{item.bio}</Text>
      </TouchableOpacity>
    </Link>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🏠 Your Digital Neighborhood</Text>
      <Text style={styles.subtitle}>
        {MEMBERS.length} neighbors in your community
      </Text>
      <FlatList
        data={MEMBERS}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        style={styles.list}
      />
    </View>
  );
}
