import { Image, StyleSheet, Platform } from "react-native";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";

export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#1D3D47" }}
      headerImage={
        <Image
          source={require("@/assets/images/redfish.jpg")}
          style={styles.reactLogo}
        />
      }
    >
      <ThemedView style={styles.titleContainer}>
        <ThemedText style={{ fontFamily: "Montserrat" }}>
          <ThemedText type="title">Welcome to minnowspace!</ThemedText>
          <HelloWave />
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText type="subtitle">
          Minnowspace is a place where we can all come together to share our
          stories, experiences, and ideas.
        </ThemedText>
      </ThemedView>

      <ThemedView style={styles.stepContainer}>
        <ThemedText style={{ fontFamily: "Montserrat" }}>
          <ThemedText type="subtitle">About Us</ThemedText>
        </ThemedText>
        <ThemedText>
          <ThemedText style={{ fontFamily: "Montserrat" }}>
            Minnowspace is your destination for creativity, connection, and
            community. It’s a space where stories, experiences, and ideas come
            to life, and everyone has the opportunity to contribute and be part
            of something special. At its core, Minnowspace is all about
            people—empowering individuals to share their voices while creating a
            platform where the rewards are shared. We may be small fish but we
            don't have to play in a small pond. With modern technnology we will
            build a community platform with video and chat that is co-owned by
            YOU, not some bazillionaire.
          </ThemedText>
        </ThemedText>
      </ThemedView>
      <ThemedView style={styles.stepContainer}>
        <ThemedText style={{ fontFamily: "Montserrat" }}>
          <ThemedText type="subtitle">Step 3: Get a fresh start</ThemedText>
        </ThemedText>
        <ThemedText style={{ fontFamily: "Montserrat" }}>
          <ThemedText>
            This is just the start of an exciting journey. Minnowspace is built
            on the idea of collaboration and creativity, and we’re laying the
            foundation for something truly unique in the digital space.
          </ThemedText>
        </ThemedText>
      </ThemedView>
    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  stepContainer: {
    gap: 8,
    marginBottom: 8,
  },
  reactLogo: {
    height: 250,
    width: 375,
    bottom: 0,
    left: 0,
    position: "absolute",
  },
});
