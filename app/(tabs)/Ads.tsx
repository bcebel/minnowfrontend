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
        __html: `<a href="https://www.tkqlhce.com/click-101317164-15077776" target="_top">
<img src="https://www.lduhtrp.net/image-101317164-15077776" width="240" height="140" alt="" border="0"/></a>`,
      }}
    />
  );
} else if (Platform.OS === "ios" || Platform.OS === "android") {
  // Code specific for the mobile platform (iOS or Android)
  App = () => (
    <WebView
      style={styles.container}
      source={{ uri: "https://www.tkqlhce.com/click-101317164-15077776" }}
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


  