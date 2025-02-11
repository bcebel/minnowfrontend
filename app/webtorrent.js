import React from "react";
import { WebView } from "react-native-webview";

const WebTorrentPlayer = () => {
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    </head>
    <body>
      <h1>WebTorrent Test</h1>
      <div id="video-container" style="width: 100%; height: 100%;"></div>
      <script>
        // Initialize WebTorrent
        const client = new WebTorrent();

        // Replace this with your magnet link
        const torrentId = 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent';

        // Add the torrent
        client.add(torrentId, (torrent) => {
          console.log('Torrent info:', torrent);

          // Find the video file in the torrent
          const file = torrent.files.find(file => file.name.endsWith('.mp4'));

          if (file) {
            // Render the video into the page
            file.appendTo('#video-container', { autoplay: true, controls: true });

            // Log progress
            torrent.on('download', (bytes) => {
              console.log('Downloaded:', bytes);
            });

            torrent.on('done', () => {
              console.log('Torrent download complete!');
            });
          }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <WebView
      originWhitelist={["*"]}
      source={{ html: htmlContent }}
      style={{ flex: 1 }}
    />
  );
};

export default function App() {
  return <WebTorrentPlayer />;
}
