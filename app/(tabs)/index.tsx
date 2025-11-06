import {
  Image,
  StyleSheet,
  Platform,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Text } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={require("@/assets/images/gigunit.png")}
          style={styles.headerImage}
        />

        <ThemedView style={styles.titleContainer}>
          <Text style={styles.title}>GigUnit</Text>
          <Text style={styles.subtitle}>The decentralized front</Text>
          <Text style={styles.tagline}>
            Liberate your media. Power to the peers.
          </Text>
        </ThemedView>

        <ThemedView style={styles.actionsContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.primaryButtonText}>Join the Neighborhood</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.secondaryButtonText}>Sign In</Text>
          </TouchableOpacity>
        </ThemedView>

        <ThemedView style={styles.features}>
          <Text style={styles.featuresTitle}>What makes us different:</Text>

          <ThemedView style={styles.featureItem}>
            <Text style={styles.featureEmoji}>🏠</Text>
            <Text style={styles.featureText}>
              Digital neighborhoods, not just feeds
            </Text>
          </ThemedView>

          <ThemedView style={styles.featureItem}>
            <Text style={styles.featureEmoji}>🎪</Text>
            <Text style={styles.featureText}>
              Live events from multiple angles
            </Text>
          </ThemedView>

          <ThemedView style={styles.featureItem}>
            <Text style={styles.featureEmoji}>💎</Text>
            <Text style={styles.featureText}>
              Earn from your content, not Zuckerberg
            </Text>
          </ThemedView>

          <ThemedView style={styles.featureItem}>
            <Text style={styles.featureEmoji}>🔒</Text>
            <Text style={styles.featureText}>You control your privacy</Text>
          </ThemedView>

          <ThemedView style={styles.featureItem}>
            <Text style={styles.featureEmoji}>🌊</Text>
            <Text style={styles.featureText}>
              P2P technology, not corporate servers
            </Text>
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40, // Extra padding at bottom for scroll
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
    color: "#00FF00",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: "#00FF00",
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: "#00AA00",
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
    backgroundColor: "#00FF00",
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 16,
    fontWeight: "bold",
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: "#00FF00",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  secondaryButtonText: {
    color: "#00FF00",
    fontSize: 16,
    fontWeight: "bold",
  },
  features: {
    marginHorizontal: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "#00FF00",
    borderRadius: 12,
    backgroundColor: "#111111",
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 16,
    textAlign: "center",
  },
  featureItem: {
    flexDirection: "row",
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
    color: "#00AA00",
    flex: 1,
    lineHeight: 18,
  },
});
