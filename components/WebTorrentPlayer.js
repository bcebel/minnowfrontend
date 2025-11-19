// components/WebTorrentPlayer.js
import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";

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
            color: #FFFF00;
            text-align: center;
            margin: 10px 0;
            font-size: 14px;
            min-height: 20px;
        }
        #sourceInfo {
            color: #00AAFF;
            text-align: center;
            margin: 8px 0;
            font-size: 14px;
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
        .peer-stats {
            color: #00FF00;
            font-size: 12px;
            text-align: center;
            margin: 5px 0;
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
    </style>
</head>
<body>
    <div class="player-container">
        <div class="video-info">🎬 ${video.fileName || "Video"}</div>
        <div id="status">🚀 Starting WebTorrent...</div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="stats" id="stats">👥 0 peers | 📥 0%</div>
        <div class="peer-stats" id="peerStats">🌐 Connecting to swarm...</div>
        <video id="videoPlayer" controls style="display:none;"></video>
        <div id="sourceInfo">Source: Determining...</div>
        <div class="error" id="errorMessage"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    <script>
        // GLOBAL SHARED WEBTORRENT CLIENT - All players on the site share this
        if (!window.globalWebTorrentClient) {
            console.log('🌐 Creating shared WebTorrent client for all users');
            window.globalWebTorrentClient = new WebTorrent();
            
            // Log global stats periodically
            setInterval(() => {
                const client = window.globalWebTorrentClient;
                console.log('🌐 Global Client - Torrents:', client.torrents.length, 
                          'Total Peers:', client.torrents.reduce((sum, t) => sum + t.numPeers, 0));
            }, 10000);
        }
        
        const client = window.globalWebTorrentClient;
        const videoElement = document.getElementById('videoPlayer');
        const statusElement = document.getElementById('status');
        const sourceInfo = document.getElementById('sourceInfo');
        const statsElement = document.getElementById('stats');
        const peerStats = document.getElementById('peerStats');
        const progressFill = document.getElementById('progressFill');
        const errorMessage = document.getElementById('errorMessage');

        let currentTorrent = null;
        let hasStartedPlaying = false;

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
            
            // Update global peer stats
            const totalTorrents = client.torrents.length;
            const totalPeers = client.torrents.reduce((sum, t) => sum + t.numPeers, 0);
            peerStats.textContent = 
                '🌐 Site-wide: ' + totalTorrents + ' active torrents, ' + totalPeers + ' total peers';
        }

        function showError(message) {
            errorMessage.style.display = 'block';
            errorMessage.textContent = message;
            console.error('Error:', message);
        }

        function usePinataFallback() {
            ${
              cid
                ? `
            updateStatus('📡 Using Pinata Gateway');
            sourceInfo.textContent = 'Source: Pinata IPFS Gateway';
            videoElement.src = 'https://gateway.pinata.cloud/ipfs/${cid}';
            videoElement.style.display = 'block';
            `
                : `
            updateStatus('❌ No video source available');
            sourceInfo.textContent = 'Source: Not available';
            `
            }
        }

        function startWebTorrent() {
            ${
              magnetLink
                ? `
            // Clean magnet link
            const magnetLink = '${magnetLink}'.replace('magnet:?magnet:', 'magnet:?');
            
            console.log('🔗 Magnet link:', magnetLink);
            updateStatus('🔍 Checking for existing torrent...');

            // Check if torrent already exists in shared client
            currentTorrent = client.get(magnetLink);
            
            if (currentTorrent) {
                console.log('✅ Found existing torrent in shared client!');
                console.log('📊 Existing torrent - Peers:', currentTorrent.numPeers, 'Progress:', currentTorrent.progress);
                updateStatus('✅ Using shared torrent (' + currentTorrent.numPeers + ' peers)');
                setupTorrentEvents(currentTorrent);
                
                // If already downloaded, play immediately
                if (currentTorrent.progress > 0) {
                    playVideoFromTorrent(currentTorrent);
                }
            } else {
                // Add new torrent to shared client
                updateStatus('🔄 Adding to shared WebTorrent client...');
                console.log('🆕 Adding new torrent to shared client');
                
                currentTorrent = client.add(magnetLink, {
                    announce: [
                        'wss://tracker.openwebtorrent.com',
                        'wss://tracker.btorrent.xyz',
                        'wss://tracker.webtorrent.dev'
                    ]
                });

                setupTorrentEvents(currentTorrent);
            }

            function setupTorrentEvents(torrent) {
                torrent.on('error', (err) => {
                    console.error('Torrent error:', err);
                    showError('WebTorrent failed: ' + err.message);
                    usePinataFallback();
                });

                torrent.on('warning', (err) => {
                    console.warn('Torrent warning:', err);
                });

                torrent.on('metadata', () => {
                    console.log('📦 Metadata loaded. Files:', torrent.files.length);
                    torrent.files.forEach(file => {
                        console.log('   -', file.name, '(' + file.length + ' bytes)');
                    });
                    updateStatus('📦 Found ' + torrent.files.length + ' files');
                });

                torrent.on('ready', () => {
                    console.log('✅ Torrent ready');
                });

                torrent.on('download', (bytes) => {
                    updateStats(torrent);
                    
                    // Start playing once we have some data
                    if (torrent.progress >= 0.05 && !hasStartedPlaying) {
                        playVideoFromTorrent(torrent);
                    }
                    
                    if (torrent.progress < 1) {
                        updateStatus('📥 Downloading: ' + Math.round(torrent.progress * 100) + '% - ' + torrent.numPeers + ' peers');
                    }
                });

                torrent.on('done', () => {
                    updateStatus('✅ Complete! Seeding to ' + torrent.numPeers + ' peers');
                    sourceInfo.textContent = 'Source: WebTorrent (Seeding to ' + torrent.numPeers + ' peers)';
                    progressFill.style.background = '#00FF00';
                });

                torrent.on('peer', () => {
                    console.log('👥 New peer connected! Total:', torrent.numPeers);
                });

                // Update stats every second
                const statsInterval = setInterval(() => {
                    if (torrent.destroyed) {
                        clearInterval(statsInterval);
                        return;
                    }
                    updateStats(torrent);
                }, 1000);
            }

            function playVideoFromTorrent(torrent) {
                if (hasStartedPlaying) return;
                
                console.log('🎬 Looking for video file...');
                const videoFile = torrent.files.find(file => {
                    const name = file.name.toLowerCase();
                    return name.includes('.mp4') || 
                           name.includes('.mov') ||
                           name.includes('.webm');
                });

                if (videoFile) {
                    console.log('✅ Found video:', videoFile.name);
                    updateStatus('🎬 Rendering: ' + videoFile.name);
                    
                    videoFile.renderTo(videoElement, (err, elem) => {
                        if (err) {
                            console.error('Render error:', err);
                            showError('Video render failed: ' + err.message);
                            usePinataFallback();
                        } else {
                            console.log('✅ Video rendered successfully');
                            videoElement.style.display = 'block';
                            hasStartedPlaying = true;
                            sourceInfo.textContent = 'Source: WebTorrent (' + torrent.numPeers + ' peers)';
                            updateStatus('✅ Playing! Sharing with ' + torrent.numPeers + ' peers');
                            
                            // Try to play (autoplay might be blocked)
                            videoElement.play().catch(e => {
                                console.log('Autoplay blocked, waiting for user interaction');
                            });
                        }
                    });
                } else {
                    console.error('❌ No video file found');
                    showError('No video file found in torrent');
                    usePinataFallback();
                }
            }

            `
                : `
            // No magnet link, use IPFS directly
            console.log('🔗 No magnet link, using IPFS fallback');
            usePinataFallback();
            `
            }
        }

        // Video event listeners
        videoElement.addEventListener('loadeddata', () => {
            console.log('✅ Video loaded successfully');
        });

        videoElement.addEventListener('canplay', () => {
            console.log('🎵 Video ready to play');
        });

        videoElement.addEventListener('play', () => {
            console.log('▶️ Playback started');
        });

        videoElement.addEventListener('error', (e) => {
            console.error('❌ Video error:', e);
            if (videoElement.error) {
                showError('Video error: ' + videoElement.error.message);
            }
        });

        // Start the WebTorrent process
        console.log('🚀 Starting True P2P WebTorrent Player');
        console.log('File: ${video.fileName}');
        console.log('Magnet: ${magnetLink}');
        console.log('CID: ${cid}');
        startWebTorrent();
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
    height: 500, // Slightly taller for better stats display
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
