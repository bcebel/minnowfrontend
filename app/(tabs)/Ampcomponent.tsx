import { WebView } from "react-native-webview";
import Constants from "expo-constants";
import { StyleSheet, Platform } from "react-native";

// Define the App function here, but only export once at the end
let App;

if (Platform.OS === "web") {
  // Code specific for the web platform
  App = () => (
    <div
      dangerouslySetInnerHTML={{
        __html: `<iframe src="https://minnowspace.com/yotu.html" height=1000</iframe>"`,
      }}
    />
  );
} else if (Platform.OS === "ios" || Platform.OS === "android") {
  // Code specific for the mobile platform (iOS or Android)
  App = () => (
    <WebView
      style={styles.container}
      source={{ uri: "https://minnowspace.com/yotu.html" }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: Constants.statusBarHeight,
  },
});

// Export the App function at the end
export default App;
