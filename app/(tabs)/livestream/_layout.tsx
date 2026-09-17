// app/(tabs)/livestream/_layout.tsx
import { Stack } from "expo-router";
import { Tabs } from "expo-router";


export const unstable_settings = {
  initialRouteName: "index", // Ensures the "Watch" screen is the base
};

export default function LivestreamLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="streams" />
      <Stack.Screen name="selector" />
    </Stack>
  );
}
