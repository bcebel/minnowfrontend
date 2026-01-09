import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { themes } from "./theme";

export default function ThemeDisplay() {
  const [currentScheme, setCurrentScheme] = useState<
    | "earth"
    | "ocean"
    | "forest"
    | "bubblegum"
    | "aqua"
    | "neon"
    | "coral"
    | "lavender"
    | "bubblefusion"
  >("earth");

  const [currentMode, setCurrentMode] = useState<"light" | "dark">("light");

  const theme = themes[currentScheme][currentMode];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background, padding: 20 }}
    >
      {/* Header */}
      <Text
        style={{
          color: theme.typography,
          fontSize: 32,
          fontWeight: "bold",
          marginBottom: 10,
        }}
      >
        Theme: {currentScheme}
      </Text>
      <Text
        style={{
          color: theme.typography,
          fontSize: 18,
          marginBottom: 20,
          opacity: 0.8,
        }}
      >
        Mode: {currentMode}
      </Text>

      {/* Theme & Mode Selector */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {(
          [
            "earth",
            "ocean",
            "forest",
            "bubblegum",
            "aqua",
            "neon",
            "coral",
            "lavender",
            "bubblefusion",
            "bubblefusion2",
          ] as const
        ).map((scheme) => (
          <TouchableOpacity
            key={scheme}
            style={{
              backgroundColor:
                currentScheme === scheme ? theme.tint : theme.foreground,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: theme.tint,
            }}
            onPress={() => setCurrentScheme(scheme)}
          >
            <Text
              style={{
                color:
                  currentScheme === scheme
                    ? theme.background
                    : theme.typography,
                fontSize: 12,
                fontWeight: "bold",
              }}
            >
              {scheme}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Light/Dark Toggle */}
      <View style={{ flexDirection: "row", gap: 10, marginBottom: 30 }}>
        <TouchableOpacity
          style={{
            backgroundColor:
              currentMode === "light" ? theme.tint : theme.foreground,
            padding: 10,
            borderRadius: 8,
            flex: 1,
          }}
          onPress={() => setCurrentMode("light")}
        >
          <Text
            style={{
              color:
                currentMode === "light" ? theme.background : theme.typography,
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            ☀️ Light
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{
            backgroundColor:
              currentMode === "dark" ? theme.tint : theme.foreground,
            padding: 10,
            borderRadius: 8,
            flex: 1,
          }}
          onPress={() => setCurrentMode("dark")}
        >
          <Text
            style={{
              color:
                currentMode === "dark" ? theme.background : theme.typography,
              textAlign: "center",
              fontWeight: "bold",
            }}
          >
            🌙 Dark
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Colors Section */}
      <View style={{ marginBottom: 30 }}>
        <Text
          style={{
            color: theme.tint,
            fontSize: 20,
            fontWeight: "bold",
            marginBottom: 15,
          }}
        >
          Main Colors
        </Text>

        {/* Background */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              backgroundColor: theme.background,
              borderRadius: 8,
              marginRight: 15,
              borderWidth: 1,
              borderColor: theme.typography,
            }}
          />
          <View>
            <Text style={{ color: theme.typography, fontWeight: "bold" }}>
              Background
            </Text>
            <Text style={{ color: theme.typography, fontSize: 12 }}>
              {theme.background}
            </Text>
          </View>
        </View>

        {/* Foreground */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              backgroundColor: theme.foreground,
              borderRadius: 8,
              marginRight: 15,
              borderWidth: 1,
              borderColor: theme.typography,
            }}
          />
          <View>
            <Text style={{ color: theme.typography, fontWeight: "bold" }}>
              Foreground
            </Text>
            <Text style={{ color: theme.typography, fontSize: 12 }}>
              {theme.foreground}
            </Text>
          </View>
        </View>

        {/* Typography */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              backgroundColor: theme.typography,
              borderRadius: 8,
              marginRight: 15,
              borderWidth: 1,
              borderColor: theme.background,
            }}
          />
          <View>
            <Text style={{ color: theme.typography, fontWeight: "bold" }}>
              Typography
            </Text>
            <Text style={{ color: theme.typography, fontSize: 12 }}>
              {theme.typography}
            </Text>
          </View>
        </View>

        {/* Tint */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              backgroundColor: theme.tint,
              borderRadius: 8,
              marginRight: 15,
              borderWidth: 1,
              borderColor: theme.typography,
            }}
          />
          <View>
            <Text style={{ color: theme.typography, fontWeight: "bold" }}>
              Tint
            </Text>
            <Text style={{ color: theme.typography, fontSize: 12 }}>
              {theme.tint}
            </Text>
          </View>
        </View>

        {/* Link */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 10,
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              backgroundColor: theme.link,
              borderRadius: 8,
              marginRight: 15,
              borderWidth: 1,
              borderColor: theme.typography,
            }}
          />
          <View>
            <Text style={{ color: theme.typography, fontWeight: "bold" }}>
              Link
            </Text>
            <Text style={{ color: theme.typography, fontSize: 12 }}>
              {theme.link}
            </Text>
          </View>
        </View>
      </View>

      {/* Accent Colors Section */}
      <View style={{ marginBottom: 30 }}>
        <Text
          style={{
            color: theme.tint,
            fontSize: 20,
            fontWeight: "bold",
            marginBottom: 15,
          }}
        >
          Accent Colors
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(theme.accents).map(([name, color]) => (
            <View key={name} style={{ alignItems: "center", width: 80 }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  backgroundColor: color,
                  borderRadius: 8,
                  marginBottom: 5,
                  borderWidth: 1,
                  borderColor: theme.typography,
                }}
              />
              <Text
                style={{
                  color: theme.typography,
                  fontSize: 12,
                  fontWeight: "bold",
                  textAlign: "center",
                }}
              >
                {name}
              </Text>
              <Text
                style={{
                  color: theme.typography,
                  fontSize: 10,
                  textAlign: "center",
                }}
              >
                {color}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* UI Elements Demo */}
      <View style={{ marginBottom: 30 }}>
        <Text
          style={{
            color: theme.tint,
            fontSize: 20,
            fontWeight: "bold",
            marginBottom: 15,
          }}
        >
          UI Elements
        </Text>

        {/* Button */}
        <TouchableOpacity
          style={{
            backgroundColor: theme.tint,
            padding: 16,
            borderRadius: 8,
            alignItems: "center",
            marginBottom: 15,
          }}
        >
          <Text
            style={{
              color: theme.background,
              fontWeight: "bold",
              fontSize: 16,
            }}
          >
            Primary Button
          </Text>
        </TouchableOpacity>

        {/* Card */}
        <View
          style={{
            backgroundColor: theme.foreground,
            padding: 16,
            borderRadius: 12,
            marginBottom: 15,
          }}
        >
          <Text
            style={{
              color: theme.typography,
              fontWeight: "bold",
              marginBottom: 5,
            }}
          >
            Card Title
          </Text>
          <Text style={{ color: theme.typography }}>
            This is a card demonstrating the foreground color with typography.
          </Text>
        </View>

        {/* Link */}
        <Text
          style={{
            color: theme.link,
            fontSize: 16,
            textDecorationLine: "underline",
          }}
        >
          This is a link example
        </Text>
      </View>

      {/* Color Usage Examples */}
      <View>
        <Text
          style={{
            color: theme.tint,
            fontSize: 20,
            fontWeight: "bold",
            marginBottom: 15,
          }}
        >
          Color Usage
        </Text>

        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 15,
          }}
        >
          <View
            style={{
              backgroundColor: theme.accents.banana,
              padding: 10,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "#130720", fontWeight: "bold" }}>
              Warning
            </Text>
          </View>
          <View
            style={{
              backgroundColor: theme.accents.apple,
              padding: 10,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "bold" }}>Error</Text>
          </View>
          <View
            style={{
              backgroundColor: theme.accents.grass,
              padding: 10,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "#130720", fontWeight: "bold" }}>
              Success
            </Text>
          </View>
          <View
            style={{
              backgroundColor: theme.accents.storm,
              padding: 10,
              borderRadius: 6,
            }}
          >
            <Text style={{ color: "#FFF", fontWeight: "bold" }}>Info</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
