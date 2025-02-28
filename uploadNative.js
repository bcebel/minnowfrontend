// UploadNative.js (for iOS and Android)
import React from "react";
import { WebView, StyleSheet, SafeAreaView } from "react-native-webview";

export default function UploadNative() {
  return (
    <SafeAreaView style={styles.container}>
      <WebView
        source={require("./upload.html")} // Your local HTML file
        style={styles.webView}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
});
