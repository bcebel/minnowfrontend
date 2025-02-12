  
import React, { useEffect } from "react";

import { Platform, View, Text, Linking } from 'react-native';
import { WebView } from 'react-native-webview';


export default function App() {
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
        window.location.href = "https://webtorrent.io";
    // For web, redirect to the hosted site
  }

  // For mobile, use WebView
  return (
    <WebView
      source={{ uri: 'https://webtorrent.io' }}
      style={{ flex: 1 }}
    />
  );
}