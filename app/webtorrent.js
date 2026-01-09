import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentPlayer({ video }) {
  const iframeRef = useRef(null);

  // For mobile: Show P2P status and encourage web access
  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>
          🌪️ P2P Video: {video.fileName || "Video"}
        </Text>
        <Text style={styles.fallbackSubtext}>
          Join from web browser for P2P streaming
        </Text>
        <Text style={styles.seedingInfo}>
          📡 This content is available via BitTorrent
        </Text>
      </View>
    );
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>P2P Video Player</title>
    <style>
        body { margin: 0; padding: 15px; background: #1C0A2E; color: white; font-family: Arial, sans-serif; }
        .p2p-badge { background: #00ffff; color: black; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-bottom: 10px; display: inline-block; }
        .seeding-stats { background: rgba(0, 255, 0, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0; font-size: 12px; }
        video { width: 100%; max-height: 400px; background: #130720; border-radius: 8px; }
        #status { color: #FFFF00; text-align: center; margin: 10px 0; font-size: 14px; }
        .progress-bar { width: 100%; height: 6px; background: #333; border-radius: 3px; margin: 10px 0; overflow: hidden; }
        .progress-fill { height: 100%; background: #00ffff; transition: width 0.3s; width: 0%; }
    </style>
</head>
<body>
    <div class="p2p-badge">🌪️ P2P STREAMING</div>
    <div class="seeding-stats" id="seedingStats">
        <div>👥 <span id="peerCount">0</span> peers | 📥 <span id="downloadSpeed">0</span> | 📤 <span id="uploadSpeed">0</span></div>
    </div>
    
    <div id="status">Initializing P2P network...</div>
    <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
    </div>
    
    <video id="videoPlayer" controls style="display:none;"></video>

    <script>
        // Use global client or create dedicated one for this video
        const client = window.globalWebTorrentClient || new WebTorrent();
        const enhancedTrackers = window.enhancedTrackers || ['wss://tracker.openwebtorrent.com'];
        
        console.log('🌪️ Starting P2P stream for:', '${video.fileName}');
        
        const magnetLink = '${video.magnetLink}';
        const cid = '${video.cid}';
        
        if (magnetLink && magnetLink.startsWith('magnet:')) {
            try {
                // Add with enhanced trackers for better P2P discovery
                const torrent = client.add(magnetLink, { 
                    announce: enhancedTrackers 
                });
                
                // Enhanced seeding and stats
                torrent.on('download', (bytes) => {
                    const percent = Math.round(torrent.progress * 100);
                    document.getElementById('progressFill').style.width = percent + '%';
                    
                    // Update real-time stats
                    document.getElementById('peerCount').textContent = torrent.numPeers;
                    document.getElementById('downloadSpeed').textContent = 
                        (torrent.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s';
                    document.getElementById('uploadSpeed').textContent = 
                        (torrent.uploadSpeed / 1024 / 1024).toFixed(2) + ' MB/s';
                    
                    if (percent >= 2) { // Lower threshold for faster playback
                        playVideo();
                    }
                    
                    document.getElementById('status').textContent = 
                        'P2P: ' + percent + '% - ' + torrent.numPeers + ' peers';
                });
                
                // Continue seeding after completion
                torrent.on('done', () => {
                    document.getElementById('status').textContent = 
                        '✅ Seeding to ' + torrent.numPeers + ' peers';
                    console.log('🌱 Now seeding:', torrent.name);
                });
                
                function playVideo() {
                    const file = torrent.files.find(f => 
                        f.name.includes('.mp4') || 
                        f.name.includes('.mov') ||
                        f.name.includes('.webm')
                    );
                    if (file && !window.hasStartedPlaying) {
                        file.getBlobURL((err, url) => {
                            if (!err) {
                                const videoElement = document.getElementById('videoPlayer');
                                videoElement.src = url;
                                videoElement.style.display = 'block';
                                window.hasStartedPlaying = true;
                                videoElement.play().catch(e => {
                                    console.log('Autoplay blocked');
                                });
                            }
                        });
                    }
                }
                
                // Fallback after 15 seconds if no P2P progress
                setTimeout(() => {
                    if (torrent.progress === 0) {
                        console.log('Falling back to IPFS');
                        document.getElementById('videoPlayer').src = 'https://${PINATA_GATEWAY}/ipfs/' + cid;
                        document.getElementById('videoPlayer').style.display = 'block';
                        document.getElementById('status').textContent = 'Using IPFS fallback';
                    }
                }, 15000);
                
            } catch (err) {
                console.error('P2P failed, using IPFS:', err);
                document.getElementById('videoPlayer').src = 'https://${PINATA_GATEWAY}/ipfs/' + cid;
                document.getElementById('videoPlayer').style.display = 'block';
                document.getElementById('status').textContent = 'P2P unavailable - using IPFS';
            }
        } else {
            // Direct IPFS fallback
            document.getElementById('videoPlayer').src = 'https://${PINATA_GATEWAY}/ipfs/' + cid;
            document.getElementById('videoPlayer').style.display = 'block';
            document.getElementById('status').textContent = 'Direct IPFS stream';
            document.querySelector('.p2p-badge').textContent = '📡 IPFS STREAM';
        }
    </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin"
        title={`P2P Video - ${video.fileName || "Video"}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    backgroundColor: "#1C0A2E",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#00ffff",
  },
  iframe: {
    width: "100%",
    height: 500, // Slightly taller for stats
    border: "none",
    backgroundColor: "#130720",
  },
  fallbackContainer: {
    marginVertical: 8,
    backgroundColor: "#1C0A2E",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  fallbackText: {
    color: "#F5F2FA",
    fontSize: 16,
    marginBottom: 5,
    fontWeight: "bold",
  },
  fallbackSubtext: {
    color: "#888",
    fontSize: 14,
    marginBottom: 10,
  },
  seedingInfo: {
    color: "#00ffff",
    fontSize: 12,
    textAlign: "center",
  },
});
