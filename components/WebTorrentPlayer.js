import React, { useEffect, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentPlayer({ video }) {
  const iframeRef = useRef(null);

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

    <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
    <script>
        console.log('🔧 Starting WebTorrent player');
        console.log('🔧 Magnet link:', '${magnetLink}');
        console.log('🔧 Magnet link length:', '${magnetLink}'.length);
        console.log('🔧 Magnet link starts with magnet:?', '${magnetLink}'.startsWith('magnet:?'));
        
        const client = new WebTorrent();
        const videoElement = document.getElementById('videoPlayer');
        const statusElement = document.getElementById('status');
        const statsElement = document.getElementById('stats');
        const progressFill = document.getElementById('progressFill');

        ${
          magnetLink
            ? `
        try {
            console.log('Attempting to add torrent');
            const torrent = client.add('${magnetLink}');          
  if (window.ReactNativeWebView) {
  window.ReactNativeWebView.postMessage(JSON.stringify({
    type: 'MAGNET_READY',
    magnet: torrent.magnetURI,
    fileName: torrent.name,          // torrent object HAS the name
    fileType: torrent.files[0]?.name?.split('.').pop() || 'unknown'
  }));
}
}
catch (err) {
  console.error('Torrent failed', err);
  // fallback to IPFS here if you like
}
}
            
            torrent.on('download', (bytes) => {
                const percent = Math.round(torrent.progress * 100);
                progressFill.style.width = percent + '%';
                statsElement.textContent = '👥 ' + torrent.numPeers + ' peers | 📥 ' + percent + '%';
                
                if (percent >= 5) {
                    playVideo();
                }
                
                statusElement.textContent = 'Downloading: ' + percent + '%';
                 if (torrent.progress > 0 && !torrent.ws) {
    const webSeed = '${PINATA_GATEWAY}/ipfs/${cid}';
    torrent.addWebSeed(webSeed);
    torrent.ws = true;  
  }
});
            });

            torrent.on('done', () => {
                statusElement.textContent = 'Complete! Seeding to ' + torrent.numPeers + ' peers';
            });

    function playVideo() {
    const file = torrent.files.find(f => f.name.includes('.mp4') || f.name.includes('.mov'));
    if (file) {
        console.log('Playing video file via blob URL:', file.name);
        
        // Use blob URL instead of direct rendering
        file.getBlobURL((err, url) => {
            if (err) {
                console.log('Blob URL error (will retry):', err.message);
                setTimeout(() => playVideo(), 1000);
                return;
            }
            
            console.log('Blob URL created, playing video');
            videoElement.src = url;
            videoElement.style.display = 'block';
            hasStartedPlaying = true;
            statusElement.textContent = '🎬 Now playing - ' + torrent.numPeers + ' peers';
            
            videoElement.play().catch(e => {
                console.log('Autoplay blocked, waiting for user interaction');
            });
        });
    }
}
            setTimeout(() => {
                if (torrent.progress === 0) {
                    ${
                      cid
                        ? `
                    console.log('Falling back to IPFS');
                    videoElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
                    videoElement.style.display = 'block';
                    statusElement.textContent = 'Using IPFS fallback';
                    `
                        : "statusElement.textContent = 'No progress - waiting for peers';"
                    }
                }
            }, 10000);
        } catch (err) {
            console.error('Torrent add failed:', err);
            ${
              cid
                ? `
            videoElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
            videoElement.style.display = 'block';
            statusElement.textContent = 'Using IPFS fallback';
            `
                : "statusElement.textContent = 'Failed to load video';"
            }
        }
        `
            : `
        ${
          cid
            ? `
        console.log('Using direct IPFS');
        videoElement.src = 'https://${PINATA_GATEWAY}/ipfs/${cid}';
        videoElement.style.display = 'block';
        statusElement.textContent = 'Streaming from IPFS';
        progressFill.style.width = '100%';
        `
            : "statusElement.textContent = 'No video source available';"
        }
        `
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
    width: 100,
    height: 450,
    border: "none",
    backgroundColor: "#000",
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
