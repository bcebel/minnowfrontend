import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import { ApolloProviderWrapper } from "../context/apolloProvider";
import { useColorScheme } from "@/hooks/useColorScheme";
// Add these imports
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Platform } from "react-native";


// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
    const isDark = colorScheme === "dark";
  const [loaded] = useFonts({
    Montserrat: require("../assets/fonts/Montserrat-Medium.ttf"),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ApolloProviderWrapper>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >

          <StatusBar
            style={isDark ? "light" : "dark"}
            backgroundColor={isDark ? "#1C0A2E" : "#FFFFFF"}
            translucent={Platform.OS === "android"}
          />
          <Stack
            screenOptions={{
              contentStyle: {
                backgroundColor: colorScheme === "dark" ? "#1C0A2E" : "#FFFFFF",
              },
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ title: "Login" }} />
            <Stack.Screen name="register" options={{ title: "Register" }} />
            <Stack.Screen
              name="privacy"
              options={{ title: "Privacy Policy" }}
            />
            <Stack.Screen name="tos" options={{ title: "Terms of Service" }} />
            <Stack.Screen name="+not-found" options={{ title: "Not Found" }} />
          </Stack>
        </ThemeProvider>
      </ApolloProviderWrapper>
    </SafeAreaProvider>
  );
}
