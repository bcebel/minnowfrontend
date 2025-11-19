// components/WebTorrentPlayer.js
import React from "react";
import { Platform, View, StyleSheet, Dimensions } from "react-native";

const { width } = Dimensions.get("window");

export default function WebTorrentPlayer({ video }) {
  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>
          WebTorrent video: {video.fileName || "Video"}
        </Text>
        <Text style={styles.fallbackSubtext}>
          (WebTorrent only available on web)
        </Text>
      </View>
    );
  }

  // Extract CID from video data
  const extractCID = () => {
    if (video.fileName && video.fileName.includes("bafybei")) {
      const cidMatch = video.fileName.match(/bafybei[a-zA-Z0-9]+/);
      return cidMatch ? cidMatch[0] : null;
    }
    if (video.videoUrl && video.videoUrl.includes("/ipfs/")) {
      return video.videoUrl.split("/ipfs/")[1];
    }
    return null;
  };

  const cid = extractCID();
  const magnetLink = video.magnetLink;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebTorrent Player</title>
    <style>
        body {
            margin: 0;
            padding: 15px;
            background: #1a1a1a;
            font-family: Arial, sans-serif;
            color: white;
        }
        .player-container {
            max-width: 100%;
            margin: 0 auto;
        }
        .video-info {
            color: #00FF00;
            margin-bottom: 10px;
            font-size: 14px;
            text-align: center;
        }
        video {
            width: 100%;
            max-height: 400px;
            background: #000;
            border-radius: 8px;
            border: 1px solid #333;
        }
        #status {
            color: #00FF00;
            text-align: center;
            margin: 10px 0;
            font-size: 14px;
            min-height: 20px;
        }
        #errorLog {
            background: #331111;
            color: #FF4444;
            padding: 10px;
            border-radius: 5px;
            margin: 10px 0;
            display: none;
            font-size: 12px;
        }
        .stats {
            color: #888;
            font-size: 12px;
            text-align: center;
            margin: 5px 0;
        }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="video-info">🎬 ${video.fileName || "Video"}</div>
        <div id="status">🌐 Initializing WebTorrent...</div>
        <video id="videoPlayer" controls></video>
        <div class="stats" id="stats"></div>
        <div id="errorLog"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    <script>
        const client = new WebTorrent();
        const videoElement = document.getElementById('videoPlayer');
        const statusElement = document.getElementById('status');
        const statsElement = document.getElementById('stats');
        const errorElement = document.getElementById('errorLog');

        function updateStatus(message) {
            statusElement.textContent = message;
            console.log('WebTorrent Status:', message);
        }

        function updateStats(peers, progress, speed) {
            let stats = '';
            if (peers > 0) stats += '👥 ' + peers + ' peers | ';
            if (progress > 0) stats += '📥 ' + progress + '% | ';
            if (speed > 0) stats += '⚡ ' + (speed / 1024 / 1024).toFixed(1) + ' MB/s';
            statsElement.textContent = stats;
        }

        function showError(message) {
            errorElement.style.display = 'block';
            errorElement.innerHTML = '<strong>Error:</strong> ' + message;
            updateStatus('❌ ' + message);
        }

        function fallbackToPinata() {
            const pinataUrl = 'https://gateway.pinata.cloud/ipfs/${cid}';
            updateStatus('📡 Using Pinata gateway');
            videoElement.src = pinataUrl;
            statsElement.textContent = 'Direct IPFS streaming';
        }

        function playVideo() {
            ${
              magnetLink
                ? `
            // Try WebTorrent first with magnet link
            updateStatus('🔗 Connecting via WebTorrent...');
            
            console.log('Adding torrent with magnet:', '${magnetLink}');
            const torrent = client.add('${magnetLink}', {
                announce: [
                    'wss://tracker.btorrent.xyz',
                    'wss://tracker.openwebtorrent.com',
                    'wss://tracker.files.fm:7073/announce'
                ]
            });

            torrent.on('error', (err) => {
                console.error('Torrent error:', err);
                showError('WebTorrent failed: ' + err.message);
                fallbackToPinata();
            });

            torrent.on('metadata', () => {
                updateStatus('📦 Found metadata - ' + torrent.files.length + ' files');
            });

            torrent.on('download', (bytes) => {
                updateStatus('📥 Downloading from swarm...');
                updateStats(
                    torrent.numPeers,
                    Math.round(torrent.progress * 100),
                    torrent.downloadSpeed
                );
            });

            torrent.on('done', () => {
                updateStatus('✅ Ready - Streaming from ' + torrent.numPeers + ' peers');
                updateStats(torrent.numPeers, 100, torrent.downloadSpeed);
                
                // Find and play the video file
                const file = torrent.files.find(f => 
                    f.name.endsWith('.mp4') || 
                    f.name.endsWith('.mov') ||
                    f.name.endsWith('.webm') ||
                    f.name.endsWith('.mkv')
                );
                
                if (file) {
                    console.log('Rendering video file:', file.name);
                    file.renderTo(videoElement);
                } else {
                    showError('No video file found in torrent');
                    fallbackToPinata();
                }
            });

            // Fallback after 15 seconds if no progress
            setTimeout(() => {
                if (torrent.progress === 0) {
                    showError('No peers found - using fallback');
                    fallbackToPinata();
                    torrent.destroy();
                }
            }, 15000);
            `
                : `
            // No magnet link, use Pinata directly
            console.log('No magnet link, using Pinata fallback');
            fallbackToPinata();
            `
            }
        }

        // Start when page loads
        videoElement.addEventListener('error', (e) => {
            console.error('Video element error:', e);
            showError('Video playback failed');
            fallbackToPinata();
        });

        videoElement.addEventListener('loadstart', () => {
            console.log('Video load started');
        });

        videoElement.addEventListener('canplay', () => {
            console.log('Video can play');
            updateStatus('✅ Video ready to play');
        });

        // Start playback
        playVideo();
    </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <iframe
        srcDoc={htmlContent}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin"
        title={`WebTorrent Player - ${video.fileName || "Video"}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
  },
  iframe: {
    width: "100%",
    height: 320,
    border: "none",
    backgroundColor: "#000",
  },
  fallbackContainer: {
    marginVertical: 8,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  fallbackText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 5,
  },
  fallbackSubtext: {
    color: "#888",
    fontSize: 12,
  },
});
