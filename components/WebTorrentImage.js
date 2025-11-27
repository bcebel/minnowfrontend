import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentImage({ image }) {
  const iframeRef = useRef(null);

  console.log("🔧 WebTorrentImage image prop:", {
    magnetLink: image.magnetLink,
    fileName: image.fileName,
    cid: image.cid,
  });

  if (Platform.OS !== "web") {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>
          P2P Image: {image.fileName || "Image"}
        </Text>
        <Text style={styles.fallbackSubtext}>(P2P only available on web)</Text>
      </View>
    );
  }

  const cid = image.cid;
  const magnetLink = image.magnetLink;

  console.log("🔧 Extracted values:", { cid, magnetLink });

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WebTorrent Image</title>
    <style>
        body { 
            margin: 0; 
            padding: 15px; 
            background: #1a1a1a; 
            color: white; 
            font-family: Arial, sans-serif; 
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 400px;
        }
        .image-info { 
            color: #00FF00; 
            margin-bottom: 10px; 
            font-size: 14px; 
            text-align: center; 
        }
        .image-container {
            width: 95%;
            max-width: 800px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        img { 
            width: 100%;
            height: auto;
            max-height: 70vh;
            border-radius: 8px; 
            background: #000;
            display: none;
        }
        #status { 
            color: #FFFF00; 
            text-align: center; 
            margin: 10px 0; 
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
            max-width: 400px;
            height: 6px; 
            background: #333; 
            border-radius: 3px; 
            margin: 10px 0; 
            overflow: hidden; 
        }
        .progress-fill { 
            height: 100%; 
            background: #00FF00; 
            transition: width 0.3s; 
            width: 0%; 
        }
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #333;
            border-top: 4px solid #00FF00;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px 0;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .error {
            color: #ff4444;
            text-align: center;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="image-info">🖼️ ${image.fileName || "Image"}</div>
    <div class="image-container">
        <div id="status">Loading image via P2P...</div>
        <div class="loading-spinner" id="spinner"></div>
        <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
        </div>
        <div class="stats" id="stats">👥 0 peers | 📥 0%</div>
        <img id="imageElement" alt="${image.fileName || "P2P Image"}" />
        <div id="error" class="error" style="display: none;"></div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    <script>
        console.log('🔧 Starting WebTorrent image loader');
        console.log('🔧 Magnet link:', '${magnetLink}');
        console.log('🔧 CID:', '${cid}');
        
        const client = new WebTorrent();
        const imageElement = document.getElementById('imageElement');
        const statusElement = document.getElementById('status');
        const statsElement = document.getElementById('stats');
        const progressFill = document.getElementById('progressFill');
        const spinner = document.getElementById('spinner');
        const errorElement = document.getElementById('error');

        let torrent = null;
        let hasLoadedImage = false;
        let fallbackTimeout = null;

        function showError(message) {
            console.error('WebTorrent Error:', message);
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            statusElement.textContent = 'Error loading image';
            spinner.style.display = 'none';
        }

        function loadFallback() {
            if (hasLoadedImage) return;
            
            ${
              cid
                ? `
            console.log('Using IPFS fallback for image');
            imageElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
            imageElement.style.display = 'block';
            spinner.style.display = 'none';
            statusElement.textContent = 'Using IPFS fallback';
            progressFill.style.width = '100%';
            hasLoadedImage = true;
            `
                : `
            showError('No image source available');
            `
            }
        }

        ${
          magnetLink
            ? `
        try {
            console.log('Attempting to add torrent for image');
            torrent = client.add('${magnetLink}');
            
            // Notify React Native if available
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'MAGNET_READY',
                    magnet: torrent.magnetURI,
                    fileName: torrent.name,
                    fileType: torrent.files[0]?.name?.split('.').pop() || 'unknown'
                }));
            }
            
            torrent.on('download', (bytes) => {
                const percent = Math.round(torrent.progress * 100);
                progressFill.style.width = percent + '%';
                statsElement.textContent = '👥 ' + torrent.numPeers + ' peers | 📥 ' + percent + '%';
                
                if (percent >= 2 && !hasLoadedImage) {
                    loadImage();
                }
                
                statusElement.textContent = 'Downloading via P2P: ' + percent + '%';
                
                // Add web seed if no progress after a bit
                if (torrent.progress > 0 && !torrent.ws) {
                    const webSeed = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
                    torrent.addWebSeed(webSeed);
                    console.log('Added web seed:', webSeed);
                    torrent.ws = true;
                }
            });

            torrent.on('done', () => {
                statusElement.textContent = '✅ Complete! Seeding to ' + torrent.numPeers + ' peers';
                spinner.style.display = 'none';
            });

            torrent.on('error', (err) => {
                console.error('Torrent error:', err);
                showError('Torrent error: ' + err.message);
            });

            function loadImage() {
                if (!torrent || !torrent.files.length) {
                    console.log('No files in torrent yet');
                    return;
                }
                
                const file = torrent.files.find(f => 
                    f.name.endsWith('.jpg') || 
                    f.name.endsWith('.jpeg') || 
                    f.name.endsWith('.png') || 
                    f.name.endsWith('.gif') ||
                    f.name.endsWith('.webp')
                );
                
                if (file && !hasLoadedImage) {
                    console.log('Loading image file:', file.name);
                    
                    file.getBlobURL((err, url) => {
                        if (err) {
                            console.log('Blob URL error:', err.message);
                            setTimeout(() => loadImage(), 1000);
                            return;
                        }
                        
                        console.log('Blob URL created, loading image');
                        imageElement.src = url;
                        imageElement.style.display = 'block';
                        imageElement.onload = () => {
                            spinner.style.display = 'none';
                            statusElement.textContent = '✅ Image loaded via P2P';
                            hasLoadedImage = true;
                            if (fallbackTimeout) {
                                clearTimeout(fallbackTimeout);
                            }
                        };
                        imageElement.onerror = () => {
                            console.log('Image load error, retrying...');
                            setTimeout(() => loadImage(), 1000);
                        };
                    });
                }
            }
            
            // Set fallback timeout
            fallbackTimeout = setTimeout(() => {
                if (!hasLoadedImage && torrent && torrent.progress === 0) {
                    console.log('Fallback triggered - no P2P progress');
                    loadFallback();
                }
            }, 8000);
            
        } catch (err) {
            console.error('Torrent add failed:', err);
            showError('Failed to start torrent: ' + err.message);
            loadFallback();
        }
        `
            : `
        // No magnet link, use IPFS directly
        ${
          cid
            ? `
        console.log('Using direct IPFS for image');
        imageElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
        imageElement.style.display = 'block';
        spinner.style.display = 'none';
        statusElement.textContent = 'Loaded from IPFS';
        progressFill.style.width = '100%';
        hasLoadedImage = true;
        `
            : `
        showError('No magnet link or CID provided');
        `
        }
        `
        }
        
        // Cleanup function
        window.cleanupTorrent = function() {
            if (torrent) {
                client.remove(torrent);
            }
            if (fallbackTimeout) {
                clearTimeout(fallbackTimeout);
            }
        };
    </script>
</body>
</html>
  `;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        try {
          iframeRef.current.contentWindow.cleanupTorrent?.();
        } catch (err) {
          console.log("Cleanup error:", err);
        }
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        style={styles.iframe}
        sandbox="allow-scripts allow-same-origin"
        title={`WebTorrent Image - ${image.fileName || "Image"}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
    borderColor: "#333",
    width: "100%",
    borderRadius: 8,
  },
  iframe: {
    width: "100%",
    height: 500,
    border: "none",
    backgroundColor: "#000",
  },
  fallbackContainer: {
    backgroundColor: "#1a1a1a",
    borderColor: "#333",
    padding: 16,
    borderRadius: 8,
    width: "100%",
    alignSelf: "center",
  },
  fallbackText: {
    color: "#FFFFFF",
    fontSize: 14,
    marginBottom: 5,
    textAlign: "center",
  },
  fallbackSubtext: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
  },
});
