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
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebTorrent Player</title>
    <style>
        body { margin: 0; padding: 15px; background: #1a1a1a; color: white; font-family: Arial, sans-serif; }
        .video-info { color: #00FF00; margin-bottom: 10px; font-size: 14px; text-align: center; }
        video { width: 100%; max-height: 400px; background: #000; border-radius: 8px; }
        #status { color: #FFFF00; text-align: center; margin: 10px 0; font-size: 14px; }
        .stats { color: #888; font-size: 12px; text-align: center; margin: 5px 0; }
        .progress-bar { width: 100%; height: 6px; background: #333; border-radius: 3px; margin: 10px 0; overflow: hidden; }
        .progress-fill { height: 100%; background: #00FF00; transition: width 0.3s; width: 0%; }
    </style>
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
            
            // Clean up if torrent was initialized
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
            // Fallback: If global client access fails, create a new local one.
            client = new WebTorrent(); 
        }


        // 2. TIMEOUT SAFETY NET
        setTimeout(() => {
            if (!isLoaded) {
                forceHttpFallback('P2P Timeout (8s)');
            }
        }, 8000); // Increased timeout slightly for video

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

                // If not already added (e.g., first client to request this)
                if (cid) {
                    torrent.addWebSeed(webSeedUrl); // Ensure reliable WebSeed
                }
                
                torrent.on('download', (bytes) => {
                    const percent = Math.round(torrent.progress * 100);
                    progressFill.style.width = percent + '%';
                    statsElement.textContent = '👥 ' + torrent.numPeers + ' peers | 📥 ' + percent + '%';
                    statusElement.textContent = 'Downloading: ' + percent + '%';
                    
                    if (percent >= 1) { // Start streaming as soon as 1% is buffered
                        playVideo();
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

                function playVideo() {
                    if (isLoaded) return;
                    
                    const file = torrent.files.find(f => f.name.match(/\.(mp4|mov|webm|ogg)$/i));
                    if (file) {
                        isLoaded = true;
                        
                        // Use renderTo for streaming, similar to the image component
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
                        });
                    }
                }
            } catch (err) {
                console.error('Torrent operation failed:', err);
                forceHttpFallback('Client Add Failed');
            }
        } else {
            forceHttpFallback('No magnet link or client');
        }

        // Cleanup function for unmount
        window.cleanup = function() {
            // Note: We don't destroy the torrent from the client, as it may be needed by another component.
            // We just clear the local video element references.
            torrent = null;
        };
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

                            // *** NEW: Send message to parent that P2P succeeded ***
                            if (window.parent && window.parent.postMessage) {
                                window.parent.postMessage(JSON.stringify({ type: 'P2P_LOAD_SUCCESS', id: '${
                                  video.id
                                }' }), '*');
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
