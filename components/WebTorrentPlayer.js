// components/WebTorrentPlayer.js - OPTIMIZED VERSION
import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentPlayer({ video }) {
  const iframeRef = useRef(null);

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
            color: #FFFF00;
            text-align: center;
            margin: 10px 0;
            font-size: 14px;
            min-height: 20px;
        }
        .stats {
            color: #888;
            font-size: 12px;
            text-align: center;
            margin: 5px 0;
        }
        .progress-bar {
            width: 100%;
            height: 6px;
            background: #333;
            border-radius: 3px;
            margin: 10px 0;
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #00FF00, #00AAFF);
            transition: width 0.3s;
            width: 0%;
        }
        .error {
            color: #FF4444;
            text-align: center;
            margin: 10px 0;
            padding: 10px;
            background: #331111;
            border-radius: 5px;
            display: none;
        }
        .health-indicator {
            text-align: center;
            margin: 5px 0;
            font-size: 12px;
        }
        .healthy { color: #00FF00; }
        .warning { color: #FFFF00; }
        .critical { color: #FF4444; }
    </style>
</head>
<body>
    <div class="player-container">
        <div class="video-info">🎬 ${video.fileName || "Video"}</div>
        <div id="status">🚀 Initializing P2P...</div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="stats" id="stats">👥 0 peers | 📥 0%</div>
        <div class="health-indicator" id="healthIndicator">🔍 Assessing swarm health...</div>
        <video id="videoPlayer" controls style="display:none;"></video>
        <div class="error" id="errorMessage"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    <script>
        // Use global client or create new one
        const client = window.globalWebTorrentClient || new WebTorrent();
        if (!window.globalWebTorrentClient) {
            window.globalWebTorrentClient = client;
        }

        const videoElement = document.getElementById('videoPlayer');
        const statusElement = document.getElementById('status');
        const statsElement = document.getElementById('stats');
        const progressFill = document.getElementById('progressFill');
        const errorMessage = document.getElementById('errorMessage');
        const healthIndicator = document.getElementById('healthIndicator');

        let currentTorrent = null;
        let hasStartedPlaying = false;
        let pinataFallbackUsed = false;
        let healthCheckInterval;

        // SMART HEALTH MONITORING
        function assessSwarmHealth(torrent) {
            const peers = torrent.numPeers;
            const progress = torrent.progress;
            const timeActive = (Date.now() - torrent.startTime) / 1000;
            
            if (peers >= 3 && progress > 0.1) {
                return { status: 'healthy', message: '🌊 Strong swarm' };
            } else if (peers >= 1 && progress > 0.05) {
                return { status: 'warning', message: '⚠️  Slow but progressing' };
            } else if (peers === 0 && timeActive > 10) {
                return { status: 'critical', message: '💀 No peers found' };
            } else if (progress === 0 && timeActive > 15) {
                return { status: 'critical', message: '❌ Stalled at 0%' };
            } else {
                return { status: 'warning', message: '🔍 Discovering peers...' };
            }
        }

        function updateHealthIndicator(torrent) {
            const health = assessSwarmHealth(torrent);
            healthIndicator.textContent = health.message;
            healthIndicator.className = 'health-indicator ' + health.status;
        }

        function updateStatus(message) {
            statusElement.textContent = message;
            console.log('Status:', message);
        }

        function updateStats(torrent) {
            const percent = Math.round(torrent.progress * 100);
            progressFill.style.width = percent + '%';
            statsElement.textContent = 
                '👥 ' + torrent.numPeers + ' peers | ' +
                '📥 ' + percent + '% | ' +
                '⚡ ' + (torrent.downloadSpeed / 1024 / 1024).toFixed(2) + ' MB/s';
        }

        function showError(message) {
            errorMessage.style.display = 'block';
            errorMessage.textContent = message;
            console.error('Error:', message);
        }

        // YOUR BRILLIANT "DOWNLOAD & RESEED" FEATURE
        function usePinataFallbackWithReseed() {
            ${
              cid
                ? `
            if (pinataFallbackUsed) return; // Prevent multiple fallbacks
            
            pinataFallbackUsed = true;
            console.log('🌐 Using Pinata fallback - will reseed to P2P!');
            updateStatus('📡 Loading from Pinata...');
            
            // Stream from Pinata
            videoElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
            videoElement.style.display = 'block';
            
            // YOUR MAGIC: When video loads, RESEED to P2P!
            videoElement.addEventListener('loadeddata', function onLoaded() {
                console.log('✅ Pinata download complete - now reseeding to P2P!');
                videoElement.removeEventListener('loadeddata', onLoaded);
                
                // Add torrent back to client to become a seeder
                if (currentTorrent && !currentTorrent.destroyed) {
                    currentTorrent.destroy(); // Clean up old torrent
                }
                
                // Create new torrent instance to seed
                const reseedTorrent = client.add('${magnetLink}'.replace('magnet:?magnet:', 'magnet:?'));
                reseedTorrent.on('ready', () => {
                    console.log('🌱 Now reseeding to P2P network!');
                    updateStatus('✅ Loaded + now seeding to P2P!');
                    currentTorrent = reseedTorrent;
                    setupTorrentEvents(reseedTorrent);
                });
            });
            
            // Handle Pinata errors
            videoElement.addEventListener('error', function onError() {
                showError('Pinata fallback also failed');
                videoElement.removeEventListener('error', onError);
            });
            `
                : `
            showError('No video source available');
            `
            }
        }

        function setupTorrentEvents(torrent) {
            torrent.startTime = Date.now();
            
            torrent.on('error', (err) => {
                console.error('Torrent error:', err);
                if (!pinataFallbackUsed) {
                    showError('P2P failed: ' + err.message);
                    usePinataFallbackWithReseed();
                }
            });

            torrent.on('metadata', () => {
                console.log('📦 Metadata loaded:', torrent.files.length + ' files');
                updateStatus('📦 Found ' + torrent.files.length + ' files');
            });

            torrent.on('download', (bytes) => {
                updateStats(torrent);
                updateHealthIndicator(torrent);
                
                // Start playing when we have enough data
                if (torrent.progress >= 0.02 && !hasStartedPlaying && !pinataFallbackUsed) {
                    playVideoFromTorrent(torrent);
                }
            });

            torrent.on('done', () => {
                updateStatus('✅ Complete! Seeding to ' + torrent.numPeers + ' peers');
                progressFill.style.background = '#00FF00';
            });

            // SMART FALLBACK TIMER - Give peers time to connect
            let fallbackTimer;
            
            if (!torrent.completedSetup) {
                torrent.completedSetup = true;
                
                // Wait longer for peers (30 seconds instead of immediate fallback)
                fallbackTimer = setTimeout(() => {
                    const health = assessSwarmHealth(torrent);
                    if (health.status === 'critical' && !hasStartedPlaying && !pinataFallbackUsed) {
                        console.log('⏰ Health check failed - activating Pinata fallback');
                        usePinataFallbackWithReseed();
                    }
                }, 30000); // 30 seconds to find peers
            }

            // Health monitoring
            healthCheckInterval = setInterval(() => {
                if (torrent.destroyed) {
                    clearInterval(healthCheckInterval);
                    return;
                }
                updateHealthIndicator(torrent);
            }, 2000);
        }

        function playVideoFromTorrent(torrent) {
            if (hasStartedPlaying || pinataFallbackUsed) return;
            
            const videoFile = torrent.files.find(file => {
                const name = file.name.toLowerCase();
                return name.includes('.mp4') || name.includes('.mov') || name.includes('.webm');
            });

            if (videoFile) {
                console.log('🎬 Playing:', videoFile.name);
                updateStatus('🎬 Playing from ' + torrent.numPeers + ' peers');
                
                videoFile.renderTo(videoElement, (err) => {
                    if (err) {
                        console.error('Render error:', err);
                        if (!pinataFallbackUsed) {
                            usePinataFallbackWithReseed();
                        }
                    } else {
                        videoElement.style.display = 'block';
                        hasStartedPlaying = true;
                        videoElement.play().catch(e => {
                            console.log('Autoplay blocked');
                        });
                    }
                });
            } else if (!pinataFallbackUsed) {
                usePinataFallbackWithReseed();
            }
        }

        // MAIN EXECUTION
        ${magnetLink ? `
        const cleanMagnet = '${magnetLink}'.replace('magnet:?magnet:', 'magnet:?');
        console.log('🚀 Starting P2P for:', '${video.fileName}');
        
        // Check for existing torrent first
        currentTorrent = client.get(cleanMagnet);
        
        if (currentTorrent) {
            console.log('✅ Using existing torrent');
            setupTorrentEvents(currentTorrent);
            if (currentTorrent.progress > 0) {
                playVideoFromTorrent(currentTorrent);
            }
        } else {
            console.log('🆕 Adding new torrent');
            currentTorrent = client.add(cleanMagnet, {
                announce: [
                    'wss://tracker.openwebtorrent.com',
                    'wss://tracker.btorrent.xyz',
                    'wss://tracker.webtorrent.dev'
                ]
            });
            setupTorrentEvents(currentTorrent);
        }
        ` : `
        console.log('❌ No magnet link');
        usePinataFallbackWithReseed();
        `}

        // Cleanup
        window.addEventListener('beforeunload', () => {
            if (healthCheckInterval) clearInterval(healthCheckInterval);
        });
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
    height: 450,
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
