import {
  Image,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Text,
  ScrollView,
  View,
  ImageBackground,
} from "react-native";
import { BlurView } from 'expo-blur';
import { useRouter } from "expo-router";
import { themes } from "../theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
const router = useRouter();
const handleLogout = async () => {
  await AsyncStorage.multiRemove(["token", "username"]);
  router.replace("/login");
};

export default function HomeScreen() {
  const router = useRouter();
  const theme = themes.bubblefusion.dark;
  const accents = themes.bubblefusion.dark.accents;
  const light = themes.bubblefusion.light;
  const lightaccents = themes.bubblefusion.light.accents;

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require("@/assets/images/bbl.jpg")}
        style={styles.heroBubble}
        resizeMode="cover"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroOverlay}>
          <Text style={[styles.heroTitle, { color: "#F5F2FA" }]}>
            bubblebase.app
          </Text>
        </View>

        


        <View style={styles.actionsContainer}>
<BlurView intensity={50} tint="light" style={styles.bubbleGlass}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: "#00FFFF" }]}
            onPress={() => router.push("/login")}
          >
            <Text style={[styles.secondaryButtonText, { color: "#F5F2FA" }]}>
              Sign In
            </Text>
          </TouchableOpacity>
</BlurView>
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.logoutButton, { backgroundColor: "#591155" }]}
          >
            <Text style={[styles.logoutButtonText, { color: "#F5F2FA" }]}>
              Logout
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: "#151159" }]}
            onPress={() => router.push("/register")}
          >
            <Text style={[styles.primaryButtonText, { color: "#F5F2FA" }]}>
              New User? Join the Bubble
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.features}>
          <View style={styles.featureItem}>
            <Text
              style={[
                { color: "#F5F2FA" },
                { marginBottom: 15 },
                { fontSize: 24 },
              ]}
            >
              Welcome to Bubblebase.
            </Text>
            <Text
              style={[
                { color: "#F5F2FA" },
                { marginBottom: 15 },
                { fontSize: 24 },
              ]}
            >
              It’s a big club and you're in it.
            </Text>
            <Text
              style={[
                { color: "#F5F2FA" },
                { fontSize: 24 },
                { marginBottom: 15 },
              ]}
            >
              Community powered p2p media using WebTorrent.
            </Text>
            <Text
              style={[
                { color: "#F5F2FA" },
                { fontSize: 24 },
                { marginBottom: 15 },
              ]}
            >
              Instead of using the big data centers & AI - we rely on each other to broadcast to our own private digital neighborhoods.  
            </Text>
            <Text
              style={[
                { color: "#F5F2FA" },
                { fontSize: 24 },
                { marginBottom: 15 },
              ]}
            >
              Users run free affiliate ads.
            </Text>
            <Text style={[{ color: "#F5F2FA" }, { fontSize: 24 }]}>
              Decentralized social media for the people.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    height: 300, // Adjust based on your image
    position: "relative",
  },
  heroBubble: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  heroOverlay: {
    position: "relative",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  heroTitle: {
    borderRadius: 20, // Rounded edges
    borderColor: "#00FFFF",
    position: "relative",
    fontSize: 36,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
    alignSelf: "center",
    padding: 3,
  },
  heroSubtitle: {
    fontSize: 18,
    borderRadius: 20, // Rounded edges
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 4,
    alignSelf: "center",
    padding: 5,
    margin: 2,
    backgroundColor: "transparent",
  },
  heroTagline: {
    borderRadius: 20, // Rounded edges
    backgroundColor: "theme.link",
    fontSize: 16,
    textAlign: "center",
    opacity: 0.9,
    alignSelf: "center",
    padding: 5,
    margin: 2,
  },
  footerBubbles: {
    flex: 1,
    width: "100%",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  headerImage: {
    width: "100%",
    height: 50,
    resizeMode: "cover",
    marginTop: Platform.OS === "ios" ? 50 : 20,
    marginBottom: 10,
  },
  titleContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
    textAlign: "center",
    opacity: 0.9,
    borderRadius: 100,
    height: 30,
  },
  actionsContainer: {
    alignSelf: "center",
    maxWidth: 300,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
    marginBottom: 20,
  },
  primaryButton: {
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 48,
    alignItems: "center",
    borderColor: "#00FFFF",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 48,
    alignItems: "center",
    backgroundColor: "rgba 57, 17, 89, 0.3",
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  features: {
    fontSize: 20,
    marginHorizontal: 20,
    padding: 16,
    backgroundColor: "transparent",
    borderRadius: 100,
    width: 300,
    alignSelf: "center",
  },
  featureItem: {
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  featureEmoji: {
    fontSize: 20,
    marginRight: 12,
    width: 24,
  },
  featureText: {
    fontSize: 18,
    flex: 1,
    lineHeight: 18,
  },
  accentShowcase: {
    marginHorizontal: 20,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  accentTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  accentGrid: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  accentCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  accentText: {
    fontSize: 18,
  },

  logoutButton: {
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 48,
    borderColor: "#00FFFF",
    alignItems: "center",
    backgroundColor: "#130720",
  },
  logoutButtonText: {
    fontSize: 18,
    fontWeight: "bold",
  },
bubbleGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)', // Semi-transparent background
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 20,
    
    // Web only (React Native Web supports this)
    boxShadow: 'inset 1px 1px 1px 0px rgba(255, 255, 255, 0.6), inset -1px -1px 2px 0px rgba(0, 0, 0, 0.2), 0 12px 32px 0 rgba(0, 0, 0, 0.15)',
    
    // Web only (Safari needs the prefix)
    backdropFilter: 'blur(16px) saturate(190%) brightness(1.1)',
    WebkitBackdropFilter: 'blur(16px) saturate(190%) brightness(1.1)',
  },
  // ... rest of your styles
});
