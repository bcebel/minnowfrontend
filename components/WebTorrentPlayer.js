import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentPlayer({ video, isFocused }) {
  const iframeRef = useRef(null);
  const [loadedViaP2P, setLoadedViaP2P] = useState(false);

  console.log("🔧 WebTorrentPlayer video prop:", {
    magnetLink: video.magnetLink,
    ipfsData: video.ipfsData,
    fileName: video.fileName,
    cid: video.cid,
  });

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

  const cid = video.cid || video.ipfsData?.cid;
  const magnetLink = video.magnetLink || video.ipfsData?.magnetLink;

  const TIMEOUT_DURATION = isFocused ? 8000 : 45000; // 8s if focused, 45s if in background
  console.log("🔧 Extracted values:", { cid, magnetLink });
  useEffect(() => {
    // Only set up listener if on web and iframe is ready
    if (Platform.OS === "web" && iframeRef.current) {
      const handleMessage = (event) => {
        // Ensure message comes from our iframe and is the correct type
        if (event.source === iframeRef.current.contentWindow) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "P2P_LOAD_SUCCESS" && data.id === video.id) {
              setLoadedViaP2P(true);
              console.log(`✅ Video ${video.id} loaded via P2P!`);
            }
          } catch (e) {
            console.warn("Failed to parse iframe message:", e);
          }
        }
      };

      window.addEventListener("message", handleMessage);

      return () => {
        window.removeEventListener("message", handleMessage);
      };
    }
  }, [video.id]);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    </head>
<body>
    <div class="video-info">🎬 ${video.fileName || "Video"}</div>
    <div id="status">Loading video...</div>
    <div class="progress-bar">
        <div class="progress-fill" id="progressFill"></div>
    </div>
    <div class="stats" id="stats">👥 0 peers | 📥 0%</div>
    <video id="videoPlayer" controls style="display:none;"></video>
 <script>
        // --- Setup ---
        const videoElement = document.getElementById('videoPlayer');
        const statusElement = document.getElementById('status');
        const statsElement = document.getElementById('stats');
        const progressFill = document.getElementById('progressFill');

        const magnet = '${magnetLink}';
        const cid = '${cid}';
        const webSeedUrl = 'https://${PINATA_GATEWAY}/ipfs/' + cid;
        
        // INJECTED DYNAMIC TIMEOUT
        const INJECTED_TIMEOUT = ${TIMEOUT_DURATION};
        const INJECTED_ID = '${video.id}';

        let torrent = null;
        let isLoaded = false;
        
        // Function to force IPFS fallback
        function forceHttpFallback(reason) {
            if (isLoaded) return;
            isLoaded = true;
            statusElement.textContent = 'Using IPFS fallback: ' + reason;
            videoElement.src = webSeedUrl;
            videoElement.style.display = 'block';
            progressFill.style.width = '100%';
            
            // Note: We don't destroy the global client
            if (torrent) torrent.destroy(); 
        }

        // 1. Get Global Client from Parent Window
        let client;
        try {
            client = window.parent.globalWebTorrentClient;
            if (!client) throw new Error("Global client not found.");
            console.log('🔗 Connected to global WebTorrent client.');
        } catch (e) {
            console.error('Failed to access global client. Using local.', e);
            
            // FALLBACK: Create a local client if global fails. Requires WebTorrent to be loaded in the PARENT window.
            if (window.parent.WebTorrent) {
                 client = new window.parent.WebTorrent(); 
            } else {
                 forceHttpFallback('WebTorrent library not available.');
                 return; // Exit script if client cannot be initialized
            }
        }
        
        // --- CORE P2P STREAMING FUNCTION (Only defined once) ---
        function playVideo() {
            if (isLoaded) return;
            
            const file = torrent.files.find(f => f.name.match(/\.(mp4|mov|webm|ogg)$/i));
            if (file) {
                isLoaded = true;
                
                file.renderTo(videoElement, (err, elem) => {
                    if (err) {
                        console.error("RenderTo error:", err);
                        isLoaded = false;
                        return;
                    }
                    videoElement.style.display = 'block';
                    statusElement.textContent = '🎬 Now playing - ' + torrent.numPeers + ' peers';
                    videoElement.play().catch(e => {
                        console.log('Autoplay blocked');
                    });

                    // *** P2P SUCCESS MESSAGE ***
                    if (window.parent && window.parent.postMessage) {
                        window.parent.postMessage(JSON.stringify({ type: 'P2P_LOAD_SUCCESS', id: INJECTED_ID }), '*');
                    }
                });
            }
        }


        // 2. TIMEOUT SAFETY NET (Uses dynamic INJECTED_TIMEOUT)
        setTimeout(() => {
            if (!isLoaded) {
                forceHttpFallback('P2P Timeout (' + INJECTED_TIMEOUT / 1000 + 's)');
            }
        }, INJECTED_TIMEOUT); 

        // 3. ADD TORRENT
        if (magnet && client) {
            try {
                torrent = client.get(magnet);
                
                if (torrent) {
                    console.log("Torrent already added to global client.");
                } else {
                    console.log("Adding new torrent to global client.");
                    torrent = client.add(magnet);
                }

                if (cid) {
                    torrent.addWebSeed(webSeedUrl); 
                }
                
                torrent.on('download', (bytes) => {
                    const percent = Math.round(torrent.progress * 100);
                    progressFill.style.width = percent + '%';
                    statsElement.textContent = '👥 ' + torrent.numPeers + ' peers | 📥 ' + percent + '%';
                    statusElement.textContent = 'Downloading: ' + percent + '%';
                    
                    if (percent >= 1) { 
                        playVideo(); // Starts streaming as soon as 1% is buffered
                    }
                });

                torrent.on('done', () => {
                    statusElement.textContent = 'Complete! Seeding to ' + torrent.numPeers + ' peers';
                    if (!isLoaded) playVideo();
                });
                
                torrent.on('error', (err) => {
                    console.error('Torrent error:', err);
                    forceHttpFallback('Torrent Error: ' + err.message);
                });

                // No need for torrent.on('ready') since client.add handles metadata fetch.
                
            } catch (err) {
                console.error('Torrent operation failed:', err);
                forceHttpFallback('Client Add Failed');
            }
        } else {
            forceHttpFallback('No magnet link or client');
        }

        // Cleanup function for unmount (optional but good practice)
        window.cleanup = function() {
            torrent = null;
        };

    </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        style={[
          styles.iframe,
          loadedViaP2P && styles.p2pIframeBorder, // Apply conditional style
        ]}
        sandbox="allow-scripts allow-same-origin allow-forms"
        title={`WebTorrent Player - ${video.fileName || "Video"}`}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1a1a1a",
  },
  iframe: {
    width: "100%",
    height: 450,
    border: "none",
    backgroundColor: "#000",
  },
  p2pIframeBorder: {
    borderColor: "#00FF00", // Green border
    borderWidth: 2,
    boxShadow: "0 0 15px rgba(0, 255, 0, 0.6)", // Subtle glow
  },
  fallbackContainer: {
    backgroundColor: "#1a1a1a",

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
