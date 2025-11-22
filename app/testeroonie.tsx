import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useTheme, useThemeWithMode } from "./theme";

export default function Test() {
  const [currentScheme, setCurrentScheme] = useState<
    "earth" | "ocean" | "forest"
  >("earth");
  const theme = useTheme(currentScheme);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        padding: 20,
      }}
    >
      <Text
        style={{
          color: theme.typography,
          fontSize: 28,
          fontWeight: "bold",
          marginBottom: 20,
        }}
      >
        Multiple Color Schemes!
      </Text>

      {/* Scheme selector */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        <TouchableOpacity
          style={{
            backgroundColor:
              currentScheme === "earth" ? theme.tint : theme.foreground,
            padding: 10,
            borderRadius: 8,
          }}
          onPress={() => setCurrentScheme("earth")}
        >
          <Text style={{ color: theme.typography }}>Earth</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            backgroundColor:
              currentScheme === "ocean" ? theme.tint : theme.foreground,
            padding: 10,
            borderRadius: 8,
          }}
          onPress={() => setCurrentScheme("ocean")}
        >
          <Text style={{ color: theme.typography }}>Ocean</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={{
            backgroundColor:
              currentScheme === "forest" ? theme.tint : theme.foreground,
            padding: 10,
            borderRadius: 8,
          }}
          onPress={() => setCurrentScheme("forest")}
        >
          <Text style={{ color: theme.typography }}>Forest</Text>
        </TouchableOpacity>
      </View>

      {/* Theme demo */}
      <View
        style={{
          backgroundColor: theme.foreground,
          padding: 16,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: theme.typography }}>
          Current scheme: {currentScheme}
        </Text>
      </View>

      <TouchableOpacity
        style={{
          backgroundColor: theme.tint,
          padding: 16,
          borderRadius: 8,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Text style={{ color: theme.background, fontWeight: "bold" }}>
          Button with {currentScheme} colors
        </Text>
      </TouchableOpacity>

      <Text style={{ color: theme.link, marginBottom: 20 }}>
        Link color in {currentScheme} scheme
      </Text>

      {/* Accent colors */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
        <View
          style={{
            width: 30,
            height: 30,
            backgroundColor: theme.accents.banana,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            width: 30,
            height: 30,
            backgroundColor: theme.accents.pumpkin,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            width: 30,
            height: 30,
            backgroundColor: theme.accents.apple,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            width: 30,
            height: 30,
            backgroundColor: theme.accents.grass,
            borderRadius: 4,
          }}
        />
        <View
          style={{
            width: 30,
            height: 30,
            backgroundColor: theme.accents.storm,
            borderRadius: 4,
          }}
        />
      </View>
    </View>
  );
}

