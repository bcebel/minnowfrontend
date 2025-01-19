import React from "react";
import { WebView } from "react-native-webview";

export default function YouTubeEmbed({ videoId }) {
  const ampYouTubeHTML = `
    <!DOCTYPE html>
    <html ⚡>
      <head>
        <script async src="https://cdn.ampproject.org/v0.js"></script>
        <script async custom-element="amp-youtube" src="https://cdn.ampproject.org/v0/amp-youtube-0.1.js"></script>
      </head>
      <body>
        <amp-youtube
          data-videoid="${videoId}"
          layout="responsive"
          width="480"
          height="270"
        ></amp-youtube>
      </body>
    </html>
  `;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: ampYouTubeHTML }}
      style={{ width: "100%", height: 270 }}
    />
  );
}
