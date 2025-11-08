import { Platform } from "react-native";
import { useLocalSearchParams } from "expo-router";

export default function SandboxScreen() {
  const endpoint =
    "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/graphql";
  const sandboxUrl = `https://studio.apollographql.com/sandbox/explorer/?endpoint=${encodeURIComponent(
    endpoint
  )}`;

  if (Platform.OS === "web") {
    // Use iframe for web
    return (
      <iframe
        src={sandboxUrl}
        style={{ width: "100%", height: "100vh", border: "none" }}
        title="GraphQL Sandbox"
      />
    );
  }

  // Fallback message for native
  return (
    <div style={{ padding: 20 }}>
      <h2>🧪 GraphQL Sandbox</h2>
      <p>
        Open in browser:{" "}
        <a href={sandboxUrl} target="_blank">
          {sandboxUrl}
        </a>
      </p>
    </div>
  );
}
