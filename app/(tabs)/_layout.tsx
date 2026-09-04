import { Tabs } from "expo-router";
import React from "react";
import { Text, View, Platform, StyleSheet} from "react-native";
import { HapticTab } from "@/components/HapticTab";
import { Colors } from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from 'expo-blur';

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // ✅ Hide the default label text
        tabBarShowLabel: false,

        // ✅ Liquid Glass Background
        tabBarBackground: () => (
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
        ),

        // ✅ Transparent tab bar so blur shows
        tabBarStyle: {
          backgroundColor: 'transparent',
          position: 'absolute',
          height: Platform.OS === "ios" ? 80 + insets.bottom : 80,
          paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
          paddingTop: 0,
          borderTopWidth: 0,
        },

        // Remove the old label style (not needed)
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          // ✅ Custom icon bubble
          tabBarIcon: () => (
            <View style={styles.bubbleGlass}>
              <Text style={styles.iconText}>👋</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="neighborhoods/index"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass}>
              <Text style={styles.iconText}>🫧</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="gallery"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass}>
              <Text style={styles.iconText}>🖼️</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="setup"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass}>
              <Text style={styles.iconText}>😀</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="livestream"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass}>
              <Text style={styles.iconText}>📺</Text>
            </View>
          ),
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
      name="neighborhoods/staticParams"
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
const styles = StyleSheet.create({
  bubbleGlass: {
    // The "bubble" look
    backgroundColor: 'rgba(255, 0, 129, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 129, 0.3)',
    borderRadius: 48, // Fully round
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 55,
    minHeight: 55,

    // Web/Edge effects (optional, only applies on web)
    boxShadow: 'inset 1px 1px 1px 0px rgba(255,255,255,0.6), inset -1px -1px 2px 0px rgba(0,0,0,0.2), 0 12px 32px 0 rgba(0,0,0,0.15)',
    backdropFilter: 'blur(16px) saturate(190%) brightness(1.1)',
    WebkitBackdropFilter: 'blur(16px) saturate(190%) brightness(1.1)',
  },
  iconText: {
    fontSize: 24,
    color: 'white',
  },
});
