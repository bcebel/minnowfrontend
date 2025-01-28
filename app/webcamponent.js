
"use dom"

import React from 'react';
import { WebView } from 'react-native-web-webview';

const DailyVideoCall = ({ roomUrl }) => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <script crossorigin src="https://unpkg.com/@daily-co/daily-js"></script>
      </head>
      <body>
        <script>
          const call = window.Daily.createFrame();
          call.join({ url: '${roomUrl}' });
        </script>
      </body>
    </html>
  `;

  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: htmlContent }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      style={{ flex: 1 }}
    />
  );
};

export default DailyVideoCall;

