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
        // Minimal height with big fonts
        tabBarStyle: {
          height: Platform.OS === "ios" ? 80 : 70, // Reduced height
          paddingBottom: 0, // Remove bottom padding
          paddingTop: 0, // Remove top padding
        },
        // Big font size with minimal margins
        tabBarLabelStyle: {
          fontSize: 36, // Large font size
          fontWeight: "500",
          marginBottom: 8, // Remove bottom margin
          marginTop: 0, // Remove top margin
          color: "#ff0000",
          includeFontPadding: false, // Remove font padding
          lineHeight: 40, // Match font size
        },
        // Minimal tab item styling
        tabBarItemStyle: {
          minHeight: 0, // No minimum height
          paddingVertical: 0, // No vertical padding
          justifyContent: "center",
          alignItems: "center",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "👋",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="neighborhoods/index"
        options={{
          title: "🌎",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="torrent"
        options={{
          title: "🎬",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: "🎨",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="Chat"
        options={{
          title: "📢",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="Home"
        options={{
          title: "🏠",
          tabBarIcon: ({ color }) => null,
        }}
      />
    </Tabs>
  );
}
