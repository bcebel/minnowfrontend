import React, { useRef, useEffect, useState, useCallback } from "react";
import { Platform, View, Text, StyleSheet, Dimensions, TouchableOpacity } from "react-native";
import WebView from "react-native-webview";

// This HTML will be used by the WebView on native platforms.
// It includes the robust chunk processing logic from the 'things2026' branch.
const PLAYER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    body { margin: 0; background-color: #000; color: white; font-family: sans-serif; }
    video { width: 100vw; height: 100vh; object-fit: contain; }
    #status { position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.5); padding: 5px; border-radius: 4px; font-size: 12px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
</head>
<body>
  <video id="video" controls autoplay playsinline muted></video>
  <div id="status">Initializing Player...</div>
  <script>
    const video = document.getElementById('video');
    const statusEl = document.getElementById('status');
    const client = new WebTorrent();
    const MediaSourceClass = window.ManagedMediaSource || window.MediaSource;
    let mediaSource;
    let sourceBuffer;
    let chunkQueue = [];
    let nextChunkIndex = 0;

    function postMessage(type, payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
      }
    }

    function updateStatus(msg, peers = '') {
      const fullMsg = msg + (peers ? ' | Peers: ' + peers : '');
      statusEl.textContent = fullMsg;
    }

    function setupMSE() {
      if (!MediaSourceClass) {
        updateStatus('MediaSource API not supported.');
        return false;
      }
      const mimeType = 'video/webm;codecs=vp8,opus';
      if (!MediaSourceClass.isTypeSupported(mimeType)) {
        updateStatus("Video format not supported: " + mimeType);
        return false;
      }
      mediaSource = new MediaSourceClass();
      video.src = URL.createObjectURL(mediaSource);
      mediaSource.addEventListener('sourceopen', onSourceOpen);
      return true;
    }

    function onSourceOpen() {
      try {
        const mimeType = 'video/webm;codecs=vp8,opus';
        sourceBuffer = mediaSource.addSourceBuffer(mimeType);
        sourceBuffer.addEventListener('updateend', processQueue);
        updateStatus('Player Ready. Waiting for chunks...');
        processQueue();
      } catch (e) {
        updateStatus('Error: ' + e.message);
      }
    }

    function processQueue() {
      if (!sourceBuffer || sourceBuffer.updating || chunkQueue.length === 0) {
        return;
      }

      const nextChunk = chunkQueue.find(c => c.chunkIndex === nextChunkIndex);
      if (!nextChunk) {
        return;
      }

      // Remove from queue
      chunkQueue = chunkQueue.filter(c => c.id !== nextChunk.id);
      updateStatus(\`Downloading Chunk #\${nextChunk.chunkIndex + 1}\`);

      client.add(nextChunk.magnetLink, { strategy: 'sequential' }, (torrent) => {
        torrent.on('wire', () => updateStatus(\`Downloading Chunk #\${nextChunk.chunkIndex + 1}\`, torrent.numPeers));
        const file = torrent.files[0];
        if (!file) {
          updateStatus(\`Error: No file in torrent for chunk #\${nextChunk.chunkIndex}\`);
          return;
        }
        file.getBuffer((err, buffer) => {
          torrent.destroy();
          if (err) {
            updateStatus(\`Error downloading chunk: \${err.message}\`);
            return;
          }
          try {
            sourceBuffer.appendBuffer(buffer);
            nextChunkIndex++;
            updateStatus(\`Playing Chunk #\${nextChunkIndex}\`);
            // Inform RN that the chunk is done
            postMessage('chunkProcessed', { id: nextChunk.id });
          } catch (e) {
            updateStatus(\`Error playing chunk: \${e.message}\`);
          }
        });
      });
    }

    // This is the entry point called from React Native
    window.addChunks = (chunks) => {
      let newChunksAdded = false;
      chunks.forEach(chunk => {
        if (!chunkQueue.some(q => q.id === chunk.id)) {
          chunkQueue.push(chunk);
          newChunksAdded = true;
        }
      });
      if (newChunksAdded) {
        chunkQueue.sort((a, b) => a.chunkIndex - b.chunkIndex);
        if (mediaSource && mediaSource.readyState === 'open') {
          processQueue();
        }
      }
    };
    
    // Initialize
    setupMSE();
  </script>
</body>
</html>
`;

// This is the Web (non-native) implementation
const WebPlayer = ({ sessionId, initialChunks, clearProcessedChunk }) => {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const nextChunkIndexRef = useRef(0);

  const [status, setStatus] = useState("Waiting for stream to start...");
  const [peerCount, setPeerCount] = useState(0);
  const [chunkQueue, setChunkQueue] = useState([]);

  console.log('[WebPlayer] Mounting or Re-rendering. Session ID:', sessionId);

  const getClient = useCallback(() => {
    if (typeof window !== "undefined" && window.globalWebTorrentClient) {
      return window.globalWebTorrentClient;
    }
    console.error('[WebPlayer] Global WebTorrent client not found!');
    return null;
  }, []);

  const processChunkQueue = useCallback(() => {
    const client = getClient();
    const sourceBuffer = sourceBufferRef.current;
    if (!client || !sourceBuffer) {
      console.log('[WebPlayer] processChunkQueue skipped: client or sourceBuffer not ready.');
      return;
    }
    if (sourceBuffer.updating) {
      console.log('[WebPlayer] processChunkQueue skipped: sourceBuffer is busy updating.');
      return;
    }

    const nextChunk = chunkQueue.find(c => c.chunkIndex === nextChunkIndexRef.current);
    if (!nextChunk) {
      console.log(`[WebPlayer] Waiting for chunk #${nextChunkIndexRef.current}, not in queue.`);
      return;
    }

    console.log(`[WebPlayer] Found chunk #${nextChunk.chunkIndex} in queue. Processing...`);
    setChunkQueue(prevQueue => prevQueue.filter(c => c.id !== nextChunk.id));
    setStatus(`Downloading Chunk #${nextChunk.chunkIndex + 1}...`);
    
    client.add(nextChunk.magnetLink, { strategy: 'sequential' }, (torrent) => {
      console.log(`[WebPlayer] Torrent added for chunk #${nextChunk.chunkIndex}. Info hash: ${torrent.infoHash}`);
      torrent.on('wire', () => setPeerCount(torrent.numPeers));
      const file = torrent.files[0];
      if (!file) {
        console.error(`[WebPlayer] No file found in torrent for chunk #${nextChunk.chunkIndex}`);
        return;
      }

      console.log(`[WebPlayer] Torrent file found: ${file.name}. Getting buffer...`);
      file.getBuffer((err, buffer) => {
        torrent.destroy();
        if (err || !buffer) {
          console.error(`[WebPlayer] Error getting buffer for chunk #${nextChunk.chunkIndex}:`, err);
          return;
        }

        console.log(`[WebPlayer] Buffer received for chunk #${nextChunk.chunkIndex}. Size: ${buffer.byteLength}. Appending to SourceBuffer...`);
        try {
          sourceBuffer.appendBuffer(buffer);
          nextChunkIndexRef.current += 1;
          setStatus(`Playing Chunk #${nextChunkIndexRef.current}`);
          console.log(`[WebPlayer] Chunk #${nextChunk.chunkIndex} appended successfully. Calling clearProcessedChunk.`);
          clearProcessedChunk(nextChunk.id);
        } catch (e) {
          console.error(`[WebPlayer] Error appending buffer for chunk #${nextChunk.chunkIndex}:`, e);
          setStatus(`Error playing chunk: ${e.message}`);
        }
      });
    });
  }, [chunkQueue, getClient, clearProcessedChunk]);
4
  const processChunkQueueRef = useRef(processChunkQueue);
  useEffect(() => {
    processChunkQueueRef.current = processChunkQueue;
  }, [processChunkQueue]);

  useEffect(() => {
    console.log('[WebPlayer] MediaSource setup effect running. Session:', sessionId);
    const MediaSourceClass = window.ManagedMediaSource || window.MediaSource;
    if (!MediaSourceClass) {
      setStatus("MediaSource API not supported.");
      console.error('[WebPlayer] MediaSource API not available.');
      return;
    }

    const mediaSource = new MediaSourceClass();
    mediaSourceRef.current = mediaSource;
    videoRef.current.src = URL.createObjectURL(mediaSource);
    console.log('[WebPlayer] MediaSource created and attached to video element.');

    const onSourceOpen = () => {
      console.log('[WebPlayer] MediaSource "sourceopen" event fired. State:', mediaSource.readyState);
      if (mediaSource.readyState === 'open') {
        try {
          const mimeType = 'video/webm;codecs=vp8,opus';
          if (!MediaSourceClass.isTypeSupported(mimeType)) {
            setStatus("Video format not supported.");
            console.error(`[WebPlayer] MIME type not supported: ${mimeType}`);
            return;
          }
          const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          console.log('[WebPlayer] SourceBuffer created.');
          const updateEndHandler = () => {
            console.log('[WebPlayer] SourceBuffer "updateend" event fired. Processing next chunk.');
            processChunkQueueRef.current();
          };
          sourceBuffer.addEventListener("updateend", updateEndHandler);
          sourceBufferRef.current = sourceBuffer;
          sourceBufferRef.current.cleanup = () => sourceBuffer.removeEventListener("updateend", updateEndHandler);
          
          // DO NOT trigger processing here. Let the useEffect for chunkQueue handle it.
          // This prevents a race condition where we try to process an empty queue.
        } catch (e) {
          console.error("[WebPlayer] Error adding source buffer:", e);
        }
      }
    };
    mediaSource.addEventListener("sourceopen", onSourceOpen);

    return () => {
      console.log('[WebPlayer] Cleanup: Removing MediaSource listeners.');
      mediaSource.removeEventListener("sourceopen", onSourceOpen);
      if (sourceBufferRef.current?.cleanup) sourceBufferRef.current.cleanup();
    };
  }, [sessionId, getClient]);

  useEffect(() => {
    if (initialChunks.length > 0) {
        console.log(`[WebPlayer] Received ${initialChunks.length} initialChunks. Current queue size: ${chunkQueue.length}.`);
    }
    const newChunks = initialChunks.filter(chunk => 
      chunk.fileType === 'video_chunk' && !chunkQueue.some(q => q.id === chunk.id)
    );
    if (newChunks.length > 0) {
      console.log(`[WebPlayer] Adding ${newChunks.length} new chunks to the queue.`);
      setChunkQueue(prev => [...prev, ...newChunks].sort((a, b) => a.chunkIndex - b.chunkIndex));
    }
  }, [initialChunks]);

  useEffect(() => {
    console.log('[WebPlayer] Chunk queue updated. Triggering process.', chunkQueue.map(c => c.chunkIndex));
    processChunkQueueRef.current();
  }, [chunkQueue]);

  return (
    <View style={styles.container}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        muted
        style={{ width: "100%", height: "100%" }}
      />
      <Text style={styles.statusText}>
        Status: {status} | Peers: {peerCount}
      </Text>
    </View>
  );
};

// This is the Native (iOS/Android) implementation
const NativePlayer = ({ initialChunks, clearProcessedChunk }) => {
  const webViewRef = useRef(null);

  useEffect(() => {
    if (initialChunks.length > 0 && webViewRef.current) {
      const filteredChunks = initialChunks.filter(c => c.fileType === 'video_chunk');
      if (filteredChunks.length === 0) return;

      const js = `
        window.addChunks(${JSON.stringify(filteredChunks)});
        true; // note: this is required, or you'll sometimes get silent failures
      `;
      webViewRef.current.injectJavaScript(js);
    }
  }, [initialChunks]);
  
  const handleWebViewMessage = (event) => {
    try {
      const { type, payload } = JSON.parse(event.nativeEvent.data);
      if (type === 'chunkProcessed' && payload.id) {
        clearProcessedChunk(payload.id);
      }
    } catch (e) {
      console.error("Error parsing message from WebView:", e);
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: PLAYER_HTML }}
        style={styles.video}
        originWhitelist={['*']}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        onMessage={handleWebViewMessage}
        onError={(e) => console.log('WebView Error:', e.nativeEvent)}
        onLoad={() => console.log('WebView Loaded')}
        // For the "white wall" issue on iOS, these props can be helpful
        useWebKit={true}
        onContentProcessDidTerminate={() => webViewRef.current?.reload()}
      />
    </View>
  );
};


// Main component that selects the player based on platform
const NeighborhoodLiveStreamPlayer = (props) => {
  if (Platform.OS === 'web') {
    // On Web, we use the direct MediaSource implementation
    return <WebPlayer {...props} />;
  } else {
    // On Native, we use the WebView implementation
    return <NativePlayer {...props} />;
  }
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: 'transparent',
    minHeight: 250, // Ensure it has a minimum height
  },
  video: {
    flex: 1,
  },

  statusText: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    color: 'white',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 3,
    borderRadius: 3,
    fontSize: 10,
  }
});

export default NeighborhoodLiveStreamPlayer;