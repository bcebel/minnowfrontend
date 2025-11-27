import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentImage({ image }) {
  const iframeRef = useRef(null);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>P2P Image: {image.fileName}</Text>
      </View>
    );
  }

  // Define WSS Trackers (REQUIRED for browser-based torrenting)
  const trackers = [
    "wss://tracker.openwebtorrent.com",
    "wss://tracker.btorrent.xyz",
    "wss://tracker.webtorrent.dev",
  ];

  const announceList = trackers
    .map((t) => `&tr=${encodeURIComponent(t)}`)
    .join("");

  // Construct a robust magnet link with fallbacks
  const cleanMagnet = image.magnetLink
    ? `${image.magnetLink}${announceList}`
    : null;
  const webSeedUrl = `https://${PINATA_GATEWAY}/ipfs/${image.cid}`;

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { margin: 0; background: #000; color: white; font-family: monospace; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        
        /* The Image container */
        .img-wrapper { flex: 1; display: flex; align-items: center; justify-content: center; position: relative; width: 100%; height: 100%; }
        
        img { max-width: 100%; max-height: 100%; object-fit: contain; display: none; }
        
        /* Loading Overlay */
        .loader { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: #111; display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 10; transition: opacity 0.5s; }
        .loader.hidden { opacity: 0; pointer-events: none; }
        
        .spinner { width: 30px; height: 30px; border: 3px solid #333; border-top: 3px solid #00ff00; border-radius: 50%; animation: spin 1s infinite linear; margin-bottom: 15px; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        
        /* Status Bar */
        .status-bar { height: 24px; background: #222; display: flex; align-items: center; padding: 0 10px; font-size: 10px; color: #888; justify-content: space-between; border-top: 1px solid #333; }
        .green { color: #00ff00; }
        .yellow { color: #ffff00; }
        .red { color: #ff4444; }

        .progress-bg { position: absolute; bottom: 0; left: 0; height: 2px; background: #00ff00; width: 0%; transition: width 0.2s; z-index: 20; }
    </style>
</head>
<body>
    <div class="img-wrapper">
        <div id="loader" class="loader">
            <div class="spinner"></div>
            <div id="loading-text">Initializing P2P Node...</div>
        </div>
        <img id="final-image" />
        <div id="progress-bar" class="progress-bg"></div>
    </div>
    
    <div class="status-bar">
        <span id="log">Waiting...</span>
        <span id="peers">👥 0</span>
    </div>


    
    <script>
        // -- DOM ELEMENTS --
        const imgEl = document.getElementById('final-image');
        const loader = document.getElementById('loader');
        const loadText = document.getElementById('loading-text');
        const logEl = document.getElementById('log');
        const peerEl = document.getElementById('peers');
        const progEl = document.getElementById('progress-bar');

        // -- STATE --
        let client = null;
        let isLoaded = false;
        
        // -- LOGGING HELPER --
        function log(msg, color='gray') {
            logEl.textContent = msg;
            logEl.className = color;
            console.log('🔧 ' + msg);
        }

        // -- FORCE FALLBACK FUNCTION --
        // This is the "Eject Button" if P2P fails
        function forceHttpFallback(reason) {
            if (isLoaded) return;
            isLoaded = true; // Prevent double load
            
            log('Falling back to HTTP: ' + reason, 'yellow');
            loadText.textContent = 'Switching to HTTP...';
            
            imgEl.src = '${webSeedUrl}';
            imgEl.style.display = 'block';
            
            imgEl.onload = () => {
                loader.classList.add('hidden');
                log('Loaded via IPFS Gateway', 'green');
            };
            
            if (client) {
                try { client.destroy(); } catch(e) {}
            }
        }

        // -- MAIN LOGIC --
        try {
            if (typeof WebTorrent === 'undefined') {
                throw new Error('WebTorrent lib failed to load');
            }

            log('Node started', 'gray');
            client = new WebTorrent();

            // 1. TIMEOUT SAFETY NET
            // If image isn't visible in 5 seconds, give up and use HTTP
            setTimeout(() => {
                if (!isLoaded) {
                    forceHttpFallback('Timeout (5s)');
                }
            }, 5000);

            const magnet = '${cleanMagnet}';

            if (!magnet) {
                forceHttpFallback('No magnet link');
            } else {
                log('Adding torrent...', 'gray');
                
                // 2. ADD TORRENT
                client.add(magnet, {
                    announce: [
                        "wss://tracker.openwebtorrent.com",
                        "wss://tracker.btorrent.xyz",
                        "wss://tracker.webtorrent.dev"
                    ]
                }, (torrent) => {
                    log('Metadata received!', 'green');
                    
                    // Immediately add the WebSeed as a "peer" to guarantee speed
                    // This makes the swarm "hybrid" instantly
                    torrent.addWebSeed('${webSeedUrl}');

                    const file = torrent.files.find(f => f.name.match(/\\.(jpg|jpeg|png|gif|webp)$/i));

                    if (!file) {
                        forceHttpFallback('No image file in torrent');
                        return;
                    }

                    // 3. RENDER STREAM
                    file.renderTo(imgEl, (err, elem) => {
                        if (err) {
                            forceHttpFallback('Render error');
                            return;
                        }
                        // Render started - hide loader immediately
                        // We don't wait for 100%, we show the stream
                        isLoaded = true;
                        loader.classList.add('hidden');
                        imgEl.style.display = 'block';
                        log('Streaming P2P...', 'green');
                    });

                    torrent.on('download', () => {
                        const p = Math.round(torrent.progress * 100);
                        progEl.style.width = p + '%';
                        peerEl.textContent = '👥 ' + torrent.numPeers;
                        
                        if (p >= 100) {
                             log('Swarm Complete (100%)', 'green');
                        }
                    });
                    
                    torrent.on('error', (err) => {
                        forceHttpFallback('Torrent Error: ' + err.message);
                    });
                });
            }

        } catch (e) {
            forceHttpFallback('Script Error: ' + e.message);
        }
            function playVideo() { // Renamed from loadImage for consistency
                    if (isLoaded) return;
                    
                    const file = torrent.files.find(f => f.name.match(/\\.(jpg|jpeg|png|gif|webp)$/i));
                    if (file) {
                        isLoaded = true;
                        
                        file.renderTo(imgEl, (err, elem) => {
                            if (err) {
                                console.error("RenderTo error:", err);
                                isLoaded = false;
                                return;
                            }
                            imgEl.style.display = 'block';
                            statusElement.textContent = '🖼️ Now streaming - ' + torrent.numPeers + ' peers';
                            
                            // *** NEW: Send message to parent that P2P succeeded ***
                            if (window.parent && window.parent.postMessage) {
                                window.parent.postMessage(JSON.stringify({ type: 'P2P_LOAD_SUCCESS', id: '${image.id}' }), '*');
                            }
                        });
                    }
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
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="WebTorrent"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 10,
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
    height: 350,
    width: "100%",
  },
  iframe: {
    width: "100%",
    height: "100%",
    border: "none",
  },
  fallbackContainer: {
    padding: 20,
    backgroundColor: "#222",
    borderRadius: 8,
  },
  fallbackText: {
    color: "#fff",
  },
});
