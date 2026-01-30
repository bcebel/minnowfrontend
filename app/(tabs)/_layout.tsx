import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();

return (
  <Tabs
    screenOptions={{
      headerShown: false, // Hide headers since tabs show location
      tabBarStyle: {
        // Apply safe area to bottom
        height: Platform.OS === "ios" ? 80 + insets.bottom : 80,
        paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
        paddingTop: 0,
        backgroundColor: "#1C0A2E",
      },
      tabBarLabelStyle: {
        fontSize: 36,
        fontWeight: "500",
        marginTop: -30,
        color: "#ff0000",
        includeFontPadding: false,
        lineHeight: 40,
      },
      tabBarItemStyle: {
        minHeight: 0,
        paddingVertical: 0,
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
        title: "🫧🫧",
        tabBarIcon: ({ color }) => null,
      }}
    />
    <Tabs.Screen
      name="gallery"
      options={{
        title: "🎬",
        tabBarIcon: ({ color }) => null,
      }}
    />
    <Tabs.Screen
      name="setup"
      options={{
        title: "😀",
        tabBarIcon: ({ color }) => null,
      }}
    />
    <Tabs.Screen
      name="livestream"
      options={{
        title: "📺",
        tabBarIcon: ({ color }) => null,
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/neighborhood-chat"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/[id]"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/create"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/invite-links"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/neighborhood-members"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/neighborhood-gallery"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/neighborhoodgallery"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
  </Tabs>
);
}
