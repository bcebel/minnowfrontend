import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs screenOptions={{}}>
      <Tabs.Screen
        name="index" // This is your welcome screen
        options={{
          title: "🌊 Welcome", // Changed from Neighborhood
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="neighborhoods/index" // Renamed from torrent
        options={{
          title: "🏠 Neighborhood",
          tabBarIcon: ({ color }) => null,
        }}
      />
      <Tabs.Screen
        name="torrent" // This becomes Public Square
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