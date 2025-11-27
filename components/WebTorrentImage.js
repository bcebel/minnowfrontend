import React, { useEffect, useRef, useState } from "react"; // ADDED useState
import { Platform, View, StyleSheet, Text } from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

// ACCEPT isFocused prop for dynamic timeout and loadedViaP2P state
export default function WebTorrentImage({ image, isFocused }) {
  const iframeRef = useRef(null);
  const [loadedViaP2P, setLoadedViaP2P] = useState(false); // State for the border/shadow

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>P2P Image: {image.fileName}</Text>
      </View>
    );
  }
const TIMEOUT_DURATION = isFocused ? 5000 : 30000;
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
useEffect(() => {
  if (Platform.OS === "web" && iframeRef.current) {
    const handleMessage = (event) => {
      // Ensure message comes from our iframe and is the correct type
      if (event.source === iframeRef.current.contentWindow) {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "P2P_LOAD_SUCCESS" && data.id === image.id) {
            setLoadedViaP2P(true);
          }
        } catch (e) {
          // Silently fail if message is not JSON or not the one we look for
        }
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      // Clean up when component unmounts
    };
  }
}, [image.id]);
  
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

        // -- INJECTED VALUES --
        const INJECTED_WEBSEED = '${webSeedUrl}';
        const INJECTED_MAGNET = '${cleanMagnet}';
        const INJECTED_TIMEOUT = ${TIMEOUT_DURATION};
        const INJECTED_ID = '${image.id}';

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
            
           imgEl.src = INJECTED_WEBSEED;
            imgEl.style.display = 'block';
            
            imgEl.onload = () => {
                loader.classList.add('hidden');
                log('Loaded via IPFS Gateway', 'gray');
            };
            
      
        }

        // -- MAIN LOGIC --
        try {
            if (typeof WebTorrent === 'undefined') {
                throw new Error('WebTorrent lib failed to load');
            }
client = window.parent.globalWebTorrentClient;
            log('Node started', 'gray');
            

     // 1. DYNAMIC TIMEOUT SAFETY NET
            setTimeout(() => {
                if (!isLoaded) {
                    forceHttpFallback('Timeout (' + INJECTED_TIMEOUT / 1000 + 's)');
                }
            }, INJECTED_TIMEOUT);

            if (!INJECTED_MAGNET) {
                forceHttpFallback('No magnet link');
            } else {
                log('Adding torrent...', 'gray');
                
                // Check if torrent already exists in the global client
                let torrent = client.get(INJECTED_MAGNET);
                
                if (!torrent) {
                    torrent = client.add(INJECTED_MAGNET, {
                        // Announce options will be inherited from the global client setup
                    });
                } else {
                    log('Torrent already active in background.', 'gray');
                }
                
                // Immediately add the WebSeed as a "peer" to guarantee hybrid loading
                torrent.addWebSeed(INJECTED_WEBSEED);

 // --- HANDLERS ---
                torrent.on('ready', () => {
                    log('Metadata received!', 'green');
                    
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
                        
                        // RENDER SUCCESS - This confirms P2P/WebSeed streaming has started
                        isLoaded = true;
                        loader.classList.add('hidden');
                        imgEl.style.display = 'block';
                        log('Streaming P2P...', 'green');
                        
                        // *** P2P SUCCESS MESSAGE ***
                        if (window.parent && window.parent.postMessage) {
                            window.parent.postMessage(JSON.stringify({ type: 'P2P_LOAD_SUCCESS', id: INJECTED_ID }), '*');
                        }
                    });
                }); // End torrent.on('ready')

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
            }

        } catch (e) {
            forceHttpFallback('Script/Client Error: ' + e.message);
        }
    </script>
</body>
</html>
  `;

return (
    <View 
      style={[
        styles.container,
        loadedViaP2P && styles.p2pContainerBorder // <--- Apply the conditional style here
      ]}
    >
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        style={styles.iframe} // <--- Keep the iframe style simple and fixed
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
    // Add border properties that will be overridden by p2pContainerBorder
    borderWidth: 0,
    overflow: "hidden",
    height: 350,
    width: "100%",
  },

  // *** NEW STYLE FOR P2P SUCCESS (Applied to the container) ***
  p2pContainerBorder: {
    borderColor: "#00FF00", // Green border
    borderWidth: 2,

    // Standard React Native shadow props for a glow effect
    shadowColor: "#00FF00",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, // Must be 1 for a solid glow
    shadowRadius: 10,

    // Crucially, include the specific CSS property for web compatibility
    // Use Webkit and box-shadow standard for maximum compatibility
    // Note: The structure below might vary based on your exact Expo/RNW version.
    boxShadow: "0px 0px 10px rgba(0, 255, 0, 0.7)",
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
