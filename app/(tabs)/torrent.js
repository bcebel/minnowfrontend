  
import React, { useEffect } from "react";



import { Platform, View, Text, Linking } from 'react-native';

import { WebView } from 'react-native-webview';

  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;



export default function App() {

  const isWeb = Platform.OS === 'web';



  if (isWeb) {

        window.location.href = BACKEND_URL;

    // For web, redirect to the hosted site

  }



  // For mobile, use WebView

  return <WebView source={{ uri: BACKEND_URL }} style={{ flex: 1 }}
  allowsFullscreenVideo={true}
  allowsInlineMediaPlayback={true}
  // You might also need this depending on the site:
  mediaPlaybackRequiresUserAction={false} />;

}
