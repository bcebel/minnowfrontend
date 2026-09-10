import { Tabs } from "expo-router";
import React from "react";
import { Text, View, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      // ✅ ADD THIS: Makes the tab bar a semantic <nav> element
      role="navigation"
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <BlurView
            intensity={60}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
        ),
        tabBarStyle: {
          backgroundColor: "transparent",
          position: "absolute",
          height: Platform.OS === "ios" ? 80 + insets.bottom : 80,
          paddingBottom: Platform.OS === "ios" ? insets.bottom : 0,
          paddingTop: 0,
          borderTopWidth: 0,
        },
        tabBarItemStyle: {
          justifyContent: "center",
          alignItems: "center",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass} role="heading" aria-level={1}>
              <Text style={styles.iconText}>👋</Text>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="neighborhoods/index"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass} role="heading" aria-level={1}>
              <Text style={styles.iconText}>🫧</Text>
            </View>
          ),
        }}
      />

      <Tabs.Screen
        name="gallery"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass} role="heading" aria-level={1}>
              <Text style={styles.iconText}>🖼️</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="livestream"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass} role="heading" aria-level={1}>
              <Text style={styles.iconText}>📺</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass} role="heading" aria-level={1}>
              <Text style={styles.iconText}>📩</Text>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="setup"
        options={{
          tabBarIcon: () => (
            <View style={styles.bubbleGlass} role="heading" aria-level={1}>
              <Text style={styles.iconText}>😀</Text>
            </View>
          ),
        }}
      />
      {/* Hidden screens - leave them exactly as they are */}
      <Tabs.Screen name="PostComposer" options={{ href: null }} />
      <Tabs.Screen
        name="neighborhoods/bubbles/PostFeed"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="neighborhoods/bubbles/neighborhood-postfeed"
        options={{ href: null }}
      />
      <Tabs.Screen name="neighborhoods/staticParams" options={{ href: null }} />
      <Tabs.Screen
        name="neighborhoods/bubbles/neighborhood-chat"
        options={{ href: null }}
      />
      <Tabs.Screen name="neighborhoods/bubbles/[id]" options={{ href: null }} />
      <Tabs.Screen
        name="neighborhoods/bubbles/create"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="neighborhoods/bubbles/invite-links"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="neighborhoods/bubbles/neighborhood-members"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="neighborhoods/bubbles/neighborhood-gallery"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="neighborhoods/bubbles/neighborhoodgallery"
        options={{ href: null }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bubbleGlass: {
    backgroundColor: "rgba(255, 0, 129, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 0, 129, 0.3)",
    borderRadius: 48,
    padding: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 55,
    minHeight: 55,
    boxShadow:
      "inset 1px 1px 1px 0px rgba(255,255,255,0.6), inset -1px -1px 2px 0px rgba(0,0,0,0.2), 0 12px 32px 0 rgba(0,0,0,0.15)",
    backdropFilter: "blur(16px) saturate(190%) brightness(1.1)",
    WebkitBackdropFilter: "blur(16px) saturate(190%) brightness(1.1)",
  },
  iconText: {
    fontSize: 24,
    color: "white",
  },
});
