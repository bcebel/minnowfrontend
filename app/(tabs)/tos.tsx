import { Image, StyleSheet, Platform } from "react-native";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";


export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#743600" }}

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
          <ThemedText type="subtitle">Terms o' Service</ThemedText>
        </ThemedText>
        <ThemedText>
          <ThemedText style={{ fontFamily: "Montserrat" }}>
            Terms of Service Effective Date: 1/24/25 Last Updated: 1/24/25 Welcome to Minnowspace! By using our app, you agree to
            these Terms of Service ("Terms"). Please read them carefully. 1.
            Acceptance of Terms By downloading, accessing, or using [Your App
            Name], you agree to comply with these Terms. If you do not agree, do
            not use the app. 2. Use of the App You agree to: Use the app for
            lawful purposes only. Not misuse or disrupt the app's functionality.
            Not reverse engineer or attempt to access the app's source code. 3.
            Intellectual Property All content, trademarks, and features in [Your
            App Name] are owned by us or our licensors. You may not copy,
            modify, or distribute our content without permission. 4. User
            Content If you share content in the app: You grant us a license to
            use it as necessary for the app's operation. You confirm that your
            content does not violate the rights of others or applicable laws. 5.
            Disclaimer of Warranties Minnowspace is provided "as is" without
            warranties of any kind. We do not guarantee the app will be
            error-free or available at all times. 6. Limitation of Liability We
            are not liable for any indirect, incidental, or consequential
            damages resulting from your use of the app. 7. Termination We
            reserve the right to suspend or terminate your access to the app at
            any time without notice for violations of these Terms. 8. Changes to
            the Terms We may modify these Terms from time to time. Continued use
            of the app constitutes your acceptance of the updated Terms. 9.
            Governing Law These Terms are governed by the laws of Texas USA. 10. Contact Us For questions about these Terms,
            contact us at: bcebel@gmail.com
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
