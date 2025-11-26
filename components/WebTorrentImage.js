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
      <View>
        <Text>
          P2P Image: {image.fileName || "Image"}
        </Text>
        <Text>(P2P only available on web)</Text>
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
    </div>

    <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    <script>
        console.log('🔧 Starting WebTorrent image loader');
        console.log('🔧 Magnet link:', '${magnetLink}');
        
        const client = new WebTorrent();
        const imageElement = document.getElementById('imageElement');
        const statusElement = document.getElementById('status');
        const statsElement = document.getElementById('stats');
        const progressFill = document.getElementById('progressFill');
        const spinner = document.getElementById('spinner');

        ${
          magnetLink
            ? `
        try {
            console.log('Attempting to add torrent for image');
            const torrent = client.add('${magnetLink}');
            if (window.ReactNativeWebView) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'MAGNET_OK',
    magnet: torrent.magnetURI
  }));
}
            
            torrent.on('download', (bytes) => {
                const percent = Math.round(torrent.progress * 100);
                progressFill.style.width = percent + '%';
                statsElement.textContent = '👥 ' + torrent.numPeers + ' peers | 📥 ' + percent + '%';
                
                if (percent >= 2) { // Lower threshold for images
                    loadImage();
                }
                
                statusElement.textContent = 'Downloading via P2P: ' + percent + '%';
                 if (torrent.progress > 0 && !torrent.ws) {
    const webSeed = '${PINATA_GATEWAY}/ipfs/${cid}';
    torrent.addWebSeed(webSeed);
    torrent.ws = true;
  }
});
            });

            torrent.on('done', () => {
                statusElement.textContent = '✅ Complete! Seeding to ' + torrent.numPeers + ' peers';
                spinner.style.display = 'none';
            });

            function loadImage() {
                const file = torrent.files.find(f => 
                    f.name.includes('.jpg') || 
                    f.name.includes('.jpeg') || 
                    f.name.includes('.png') || 
                    f.name.includes('.gif') ||
                    f.name.includes('.webp')
                );
                
                if (file && !window.hasLoadedImage) {
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
                        };
                        imageElement.onerror = () => {
                            statusElement.textContent = '❌ Failed to load image';
                            spinner.style.display = 'none';
                        };
                        window.hasLoadedImage = true;
                    });
                }
            }
            
            // Fallback after 8 seconds if no P2P progress
            setTimeout(() => {
                if (torrent.progress === 0) {
                    ${
                      cid
                        ? `
                    console.log('Falling back to IPFS for image');
                    imageElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
                    imageElement.style.display = 'block';
                    spinner.style.display = 'none';
                    statusElement.textContent = 'Using IPFS fallback';
                    `
                        : "statusElement.textContent = 'No P2P peers found';"
                    }
                }
            }, 8000);
            
        } catch (err) {
            console.error('Torrent add failed:', err);
            ${
              cid
                ? `
            imageElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
            imageElement.style.display = 'block';
            spinner.style.display = 'none';
            statusElement.textContent = 'P2P failed - using IPFS';
            `
                : "statusElement.textContent = 'Failed to load image';"
            }
        }
        `
            : `
        ${
          cid
            ? `
        console.log('Using direct IPFS for image');
        imageElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
        imageElement.style.display = 'block';
        spinner.style.display = 'none';
        statusElement.textContent = 'Loaded from IPFS';
        progressFill.style.width = '100%';
        `
            : "statusElement.textContent = 'No image source available';"
        }
        `
        }
    </script>
</body>
</html>
  `;

  return (
    <View>
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
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#333",
    width: "95%",
    alignSelf: "center",
  },
  iframe: {
    width: "100%",
    height: 500, // Slightly taller to accommodate image loading states
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
    width: "95%",
    alignSelf: "center",
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
