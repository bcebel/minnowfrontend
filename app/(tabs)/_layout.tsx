import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        // Increase tab bar height
        tabBarStyle: {
          height: Platform.OS === "ios" ? 100 : 80, // Adjust these values as needed
          paddingBottom: Platform.OS === "ios" ? 30 : 10,
          paddingTop: 10,
          
        },
        // Increase font size for tab labels
        tabBarLabelStyle: {
          fontSize: 16, // Increase font size
          fontWeight: "600",
          marginBottom: Platform.OS === "ios" ? 15 : 5,
        },
        // Make the tab bar itself larger
        tabBarItemStyle: {
          minHeight: 60, // Increase minimum height of each tab item
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "🌊 Welcome",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="neighborhoods/index"
        options={{
          title: "🏠 Neighborhood",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="torrent"
        options={{
          title: "🎪 Public Square",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: "📹 Studio",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="Chat"
        options={{
          title: "👥 Social",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="Home"
        options={{
          title: "👥 Home",
          tabBarIcon: ({ color }) => null,
        }}
      />
    </Tabs>
  );
}
