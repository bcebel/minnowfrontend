import { Image, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { Text } from "react-native";
import { ThemedView } from "@/components/ThemedView";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <Image
        source={require("@/assets/images/redfish.jpg")}
        style={styles.headerImage}
      />

      <ThemedView style={styles.titleContainer}>
        <Text style={styles.title}>Welcome to MinnowSpace!</Text>
        <Text style={styles.subtitle}>
          Where small fish make big waves together
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
        <Text style={styles.feature}>
          🏠 Digital neighborhoods, not just feeds
        </Text>
        <Text style={styles.feature}>🎪 Live events from multiple angles</Text>
        <Text style={styles.feature}>
          💎 Earn from your content, not Zuckerberg
        </Text>
        <Text style={styles.feature}>🔒 You control your privacy</Text>
        <Text style={styles.feature}>
          🌊 P2P technology, not corporate servers
        </Text>
      </ThemedView>

      <ThemedView style={styles.quote}>
        <Text style={styles.quoteText}>
          "We may be small fish but we don't have to play in a small pond."
        </Text>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  headerImage: {
    width: "100%",
    height: 200,
    resizeMode: "cover",
  },
  titleContainer: {
    padding: 20,
    alignItems: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#00FF00",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: "#00AA00",
    textAlign: "center",
    opacity: 0.9,
  },
  actionsContainer: {
    padding: 20,
    gap: 15,
  },
  primaryButton: {
    backgroundColor: "#00FF00",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#000000",
    fontSize: 18,
    fontWeight: "bold",
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: "#00FF00",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "transparent",
  },
  secondaryButtonText: {
    color: "#00FF00",
    fontSize: 18,
    fontWeight: "bold",
  },
  features: {
    margin: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#00FF00",
    borderRadius: 12,
    backgroundColor: "#111111",
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 15,
    textAlign: "center",
  },
  feature: {
    fontSize: 16,
    color: "#00AA00",
    marginBottom: 10,
    paddingLeft: 10,
  },
  quote: {
    margin: 20,
    padding: 15,
    borderLeftWidth: 4,
    borderLeftColor: "#00FF00",
    backgroundColor: "#111111",
  },
  quoteText: {
    fontSize: 16,
    color: "#00AA00",
    fontStyle: "italic",
    lineHeight: 22,
  },
});
