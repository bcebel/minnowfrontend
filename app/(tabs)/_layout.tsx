import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { IconSymbol } from "@/components/ui/IconSymbol";
import TabBarBackground from "@/components/ui/TabBarBackground";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={
        {
          // ... your existing options
        }
      }
    >
      <Tabs.Screen
        name="index" // This is your welcome screen
        options={{
          title: "🌊 Welcome", // Changed from Neighborhood
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="star.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Neighborhood" // Renamed from torrent
        options={{
          title: "🏠 Neighborhood",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="torrent" // This becomes Public Square
        options={{
          title: "🎪 Public Square",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="play.rectangle.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="videos"
        options={{
          title: "📹 Studio",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="video.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="Chat"
        options={{
          title: "👥 Social",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="message.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}