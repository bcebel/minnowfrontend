import { Image, StyleSheet, Platform } from "react-native";

import { HelloWave } from "@/components/HelloWave";
import ParallaxScrollView from "@/components/ParallaxScrollView";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";


export default function HomeScreen() {
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: "#A1CEDC", dark: "#743600" }}
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
          <ThemedText type="subtitle">Privacy Policy</ThemedText>
        </ThemedText>
        <ThemedText>
          <ThemedText style={{ fontFamily: "Montserrat" }}>
            Privacy Policy
Effective Date: 1/24/2025 </ThemedText>
Last Updated: 1/24/2025

Minnowspace respects your privacy and is committed to protecting the information you share with us. This Privacy Policy describes how we collect, use, and protect your data.

1. Information We Collect
We may collect the following information when you use Minnowspace:

Personal Information: Name, email address, or other data you provide.
Device Information: IP address, device type, operating system, and unique device identifiers.
Usage Data: Information about how you interact with the app, such as features used and time spent on the app.
2. How We Use Your Information
We use your data to:

Provide and maintain our services.
Improve app functionality and user experience.
Respond to user inquiries and offer support.
Ensure security and prevent fraud.
3. Sharing Your Information
We do not sell or share your personal data with third parties except:

With your consent.
To comply with legal obligations.
With service providers who assist in operating our app.
4. Data Security
We use industry-standard measures to protect your data, but no system is 100% secure. Use the app at your own risk.

5. Your Rights
You have the right to:

Access and review the data we collect about you.
Request deletion of your data.
Opt-out of non-essential data collection.
6. Third-Party Links and Services
Our app may link to third-party websites or services. We are not responsible for their privacy practices. Please review their policies before sharing your information.

7. Children’s Privacy
Minnowspace is not intended for use by children under the age of 13. We do not knowingly collect personal information from children.

8. Changes to This Privacy Policy
We may update this Privacy Policy. Changes will be posted with the "Last Updated" date.

9. Contact Us
If you have any questions about this Privacy Policy, contact us at:
bcebel@gmail.com


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
