import React, { useEffect } from "react";
import { Platform, View, Text, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function App() {
  const isWeb = Platform.OS === 'web';

  if (isWeb) {
    // For web, redirect to the hosted site
    window.location.href = BACKEND_URL;
    return null; // Return null so nothing else renders
  }

  // For mobile, use WebView
  return (
    <WebView 
      source={{ uri: BACKEND_URL }} 
      style={{ flex: 1 }} 
      allowsFullscreenVideo={true} 
      allowsInlineMediaPlayback={true} 
      mediaPlaybackRequiresUserAction={false} 
    />
  );
}
