import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import "../unistyles";

export default function Test() {
  // Check if theme is available
  if (!StyleSheet.theme?.colors) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading themes...</Text>
      </View>
    );
  }

  const theme = StyleSheet.theme;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        justifyContent: "center",
        alignItems: "center",
        padding: theme.gap(3),
      }}
    >
      <Text
        style={{
          color: theme.colors.typography,
          fontSize: 20,
          marginBottom: theme.gap(2),
        }}
      >
        It works!
      </Text>

      {/* Card with foreground color */}
      <View
        style={{
          backgroundColor: theme.colors.foreground,
          padding: theme.gap(3),
          borderRadius: 12,
          marginBottom: theme.gap(2),
        }}
      >
        <Text style={{ color: theme.colors.typography }}>
          This uses foreground color
        </Text>
      </View>

      {/* Button with tint color */}
      <TouchableOpacity
        style={{
          backgroundColor: theme.colors.tint,
          padding: theme.gap(2),
          borderRadius: 8,
          marginBottom: theme.gap(2),
        }}
      >
        <Text style={{ color: theme.colors.background, fontWeight: "bold" }}>
          Tint Button
        </Text>
      </TouchableOpacity>

      {/* Link color */}
      <Text style={{ color: theme.colors.link, marginBottom: theme.gap(2) }}>
        This is a link
      </Text>

      {/* Accent colors demo */}
      <View style={{ flexDirection: "row", gap: theme.gap(1) }}>
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: theme.colors.accents.banana,
          }}
        />
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: theme.colors.accents.pumpkin,
          }}
        />
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: theme.colors.accents.apple,
          }}
        />
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: theme.colors.accents.grass,
          }}
        />
        <View
          style={{
            width: 20,
            height: 20,
            backgroundColor: theme.colors.accents.storm,
          }}
        />
      </View>

      {/* Gap system demo */}
      <Text
        style={{
          color: theme.colors.typography,
          marginTop: theme.gap(3),
          fontSize: 12,
          opacity: 0.7,
        }}
      >
        Gap demo: {theme.gap(1)} | {theme.gap(2)} | {theme.gap(3)}
      </Text>
    </View>
  );
}
