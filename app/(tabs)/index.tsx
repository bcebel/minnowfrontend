import {
  Image,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Text,
  ScrollView,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { themes } from "../theme";

export default function HomeScreen() {
  const router = useRouter();
  const theme = themes.bubblefusion.dark;
  const accents = themes.bubblefusion.dark.accents;
  const light = themes.bubblefusion.light;
  const lightaccents =themes.bubblefusion.light.accents;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Hero Section with Bubble Background */}
      <View style={styles.heroSection}>
        <Image
          source={require("@/assets/images/bubble.jpg")}
          style={styles.heroBubble}
          resizeMode="cover"
        />
        <View style={styles.heroOverlay}>
          <Text style={[styles.heroTitle, { backgroundColor: theme.tint }]}>
            bubblebase.app
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Rest of your content */}
        <View style={styles.actionsContainer}>
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

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: theme.tint }]}
            onPress={() => router.push("/login")}
          >
            <Text style={[styles.secondaryButtonText, { color: theme.tint }]}>
              Sign In
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={styles.features} >
          <Image
          source={require("@/assets/images/pexels-pixabay-270873.jpg")}
           style={styles.heroBubble}
          resizeMode="cover"
        />
    
          {/* Your feature items */}

          <View style={styles.featureItem}>
            <Text
              style={[styles.heroSubtitle, { backgroundColor: accents.banana }]}
            >
              🫧 its poppin in here 🫧
            </Text>
            <Text
              style={[styles.heroTagline, { backgroundColor: accents.storm }]}
            >
              🫧 bubbly & based 🫧
            </Text>
            <Text
              style={[styles.heroSubtitle, { backgroundColor: accents.banana }]}
            >
              🫧 Network with and for your peers 🫧
            </Text>
            <Text
              style={[styles.heroTagline, { backgroundColor: accents.storm }]}
            >
              🫧 leave big tech out of YOUR bubble 🫧
            </Text>
            <Text
              style={[styles.heroSubtitle, { backgroundColor: accents.banana }]}
            >
              🫧 its a big club... and you're in it 🫧
            </Text>
            <Text
              style={[styles.heroTagline, { backgroundColor: accents.storm }]}
            >
              🫧 bubble up 🫧
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
    height: 250, // Adjust based on your image
    position: "relative",
  },
  heroBubble: {
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)", // Dark overlay for text readability
    paddingHorizontal: 20,
  },
  heroTitle: {
    borderRadius: 20, // Rounded edges
    position: "relative",
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 4,
    alignSelf: "center",
    padding: 3,
  },
  heroSubtitle: {
    fontSize: 20,
    borderRadius: 20, // Rounded edges
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 4,
    alignSelf: "center",
    padding: 5,
    margin: 2,
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

  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
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
    fontSize: 14,
    textAlign: "center",
    opacity: 0.9,
  },
  actionsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 12,
    marginBottom: 20,
  },
  primaryButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  features: {
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    borderRadius: 12,
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
    fontSize: 14,
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
    fontSize: 16,
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
    fontSize: 16,
  },
  // ... rest of your styles
});


