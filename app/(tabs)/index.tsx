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
        source={require("@/assets/images/bubble.avif")}
        style={styles.heroBubble}
        resizeMode="cover"
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroOverlay}>
          <Text style={[styles.heroTitle, { backgroundColor: theme.tint }]}>
            bubblebase.app
          </Text>
        </View>

        {/* Rest of your content */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.tint }]}
            onPress={() => router.push("/login")}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.tint }]}>
              Sign In
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleLogout}
            style={[styles.logoutButton, { backgroundColor: "#130720" }]}
          >
            <Text style={[styles.logoutButtonText, { color: theme.tint }]}>
              Logout
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: theme.tint }]}
            onPress={() => router.push("/register")}
          >
            <Text
              style={[styles.primaryButtonText, { color: theme.background }]}
            >
              New User? Join the Bubble
            </Text>
          </TouchableOpacity>
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
    maxWidth: 280,
    borderRadius: 100,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  primaryButtonText: {
    maxWidth: 275,
    borderRadius: 100,
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#130720",
  },
  secondaryButtonText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  features: {
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
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderColor: "#ff00ff",
    alignItems: "center",
    backgroundColor: "#130720",
  },
  logoutButtonText: {
    fontSize: 18,
    fontWeight: "bold",
  },
  // ... rest of your styles
});
