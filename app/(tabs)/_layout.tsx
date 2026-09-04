import { Tabs } from "expo-router";
import React from "react";
import { Text, View, Platform, StyleSheet} from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from 'expo-blur';

export default function TabLayout() {
  const colorScheme = useColorScheme();
    const insets = useSafeAreaInsets();

return (
  <Tabs
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        // ✅ Make it transparent so the BlurView shows through
        backgroundColor: 'transparent',
        position: 'absolute', // Optional: Makes it float over content
        height: Platform.OS === "ios" ? 80 + insets.bottom : 80,
        paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
        paddingTop: 0,
        borderTopWidth: 0, // Remove default line
      },
      // ✅ THE MAGIC: Render the BlurView as the background
      tabBarBackground: () => (
        <BlurView
          intensity={60}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ),
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
tabBarIcon: () => (
  <View style={styles.bubbleGlass}>
    <Text style={{ fontSize: 23 }}>👋</Text>
  </View>
),
      }}
    />

    <Tabs.Screen
      name="neighborhoods/index"
      options={{
        title: "🫧",
        tabBarIcon: ({ color }) => null,
      }}
    />
    <Tabs.Screen
      name="gallery"
      options={{
        title: "🖼️",
        tabBarIcon: ({ color }) => null,
      }}
    />
    <Tabs.Screen
      name="neighborhoods/staticParams"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
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
      name="PostComposer"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />

    <Tabs.Screen
      name="neighborhoods/bubbles/PostFeed"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
      }}
    />
    <Tabs.Screen
      name="neighborhoods/bubbles/neighborhood-postfeed"
      options={{
        href: null, // THIS IS THE TRICK: It hides the tab button
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

const styles = StyleSheet.create ({
bubbleGlass: {
    backgroundColor: 'rgba(255, 0, 129, 0.3)', // Semi-transparent background
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 129, 0.3)',
    borderRadius: 48,
    
    // Web only (React Native Web supports this)
    boxShadow: 'inset 1px 1px 1px 0px rgba(255, 255, 255, 0.6), inset -1px -1px 2px 0px rgba(0, 0, 0, 0.2), 0 12px 32px 0 rgba(0, 0, 0, 0.15)',
    
    // Web only (Safari needs the prefix)
    backdropFilter: 'blur(16px) saturate(190%) brightness(1.1)',
    WebkitBackdropFilter: 'blur(16px) saturate(190%) brightness(1.1)',
  },

});
