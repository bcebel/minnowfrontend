  
import React, { useEffect } from "react";

import { Platform, View, Text, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function App() {
  // const isWeb = Platform.OS === 'web'; // <-- Can remove this line

  // if (isWeb) { // <-- Remove this
  //    window.location.href = BACKEND_URL; // <-- Remove this
  //    // For web, redirect to the hosted site // <-- Remove this
  // } // <-- Remove this

  // Now, for ALL platforms, it will attempt to render the WebView
  // Note: react-native-webview on 'web' renders as a standard iframe.
  return <WebView source={{ uri: BACKEND_URL }} style={{ flex: 1 }} />;
}
