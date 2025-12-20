// NeighborhoodLiveStreamPlayer.tsx
import React, { useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Dimensions } from 'react-native';
import WebView from 'react-native-webview';

const PLAYER_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { margin:0; background:#000; color:white; font-family:sans-serif; }
    video { width:100%; height:100%; object-fit:contain; }
    #status { position:absolute; bottom:10px; left:10px; background:rgba(0,0,0,0.5); padding:5px; border-radius:4px; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
</head>
<body>
  <video id="video" controls autoplay playsinline muted></video>
  <div id="status">Initializing...</div>

  <script>
    const video = document.getElementById('video');
    const statusEl = document.getElementById('status');
    const client = new WebTorrent();
    let mediaSource;
    let sourceBuffer;
    let queue = [];
    let nextIndex = 0;

    function updateStatus(msg, peers = '') {
      statusEl.textContent = msg + (peers ? ' | Peers: ' + peers : '');
    }

    function setupMSE(mime) {
      const Constructor = window.ManagedMediaSource || window.MediaSource;
      if (!Constructor || !Constructor.isTypeSupported(mime)) {
        updateStatus('MSE not supported or bad codec');
        return false;
      }
      mediaSource = new Constructor();
      video.src = URL.createObjectURL(mediaSource);
      mediaSource.addEventListener('sourceopen', () => {
        sourceBuffer = mediaSource.addSourceBuffer(mime);
        sourceBuffer.mode = 'sequence';
        sourceBuffer.addEventListener('updateend', processQueue);
        updateStatus('MSE ready');
        processQueue();
      });
      return true;
    }

    function processQueue() {
      if (!sourceBuffer || sourceBuffer.updating || queue.length === 0) return;
      const next = queue.find(c => c.index === nextIndex);
      if (!next) return;

      queue = queue.filter(c => c.index !== nextIndex); // remove processed
      updateStatus(\`Streaming chunk \${nextIndex + 1}\`);

      const torrent = client.add(next.magnet, { strategy: 'sequential' });
      const file = torrent.files[0];

      // Critical for live: stream as pieces arrive, not wait for "done"
      file.createReadStream().on('data', chunk => {
        if (sourceBuffer.updating) queue.push(chunk); // temp queue if busy
        else sourceBuffer.appendBuffer(chunk);
      });

      torrent.on('done', () => {
        nextIndex++;
        processQueue(); // continue to next
      });

      torrent.on('wire', () => updateStatus(\`Downloading chunk \${nextIndex + 1}\`, torrent.numPeers));
    }

    window.addChunks = (chunks) => { // called from RN
      chunks.forEach(c => {
        if (!queue.find(q => q.index === c.chunkIndex)) {
          queue.push({ index: c.chunkIndex, magnet: c.magnetLink });
        }
      });
      queue.sort((a,b) => a.index - b.index);
      if (mediaSource && mediaSource.readyState === 'open') processQueue();
    };

    // Start with common codec - adjust to your encoding!
    setupMSE('video/mp4; codecs="avc1.42E01E, mp4a.40.2"');
  </script>
</body>
</html>
`;

type Props = {
  sessionId: string;
  initialChunks: any[]; // your chunk objects with id, chunkIndex, magnetLink
  clearProcessedChunk: (id: string) => void;
};

export default function NeighborhoodLiveStreamPlayer({ initialChunks, clearProcessedChunk }: Props) {
  const webViewRef = useRef<any>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (initialChunks.length > 0 && webViewRef.current) {
      // Sort and send chunks
      const sorted = [...initialChunks].sort((a,b) => a.chunkIndex - b.chunkIndex);
      const js = `window.addChunks(${JSON.stringify(sorted.map(c => ({
        chunkIndex: c.chunkIndex,
        magnetLink: c.magnetLink
      })))}); true;`;
      webViewRef.current.injectJavaScript(js);

      // Clear after sending (they'll be processed inside)
      sorted.forEach(c => clearProcessedChunk(c.id));
    }
  }, [sortedChunks.length, processedChunks.size]);

  return (
    <View style={styles.container}>
      <WebView
        key={key}
        ref={webViewRef}
        source={{ html: PLAYER_HTML }}
        style={styles.video}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        useWebKit={true}
        onContentProcessDidTerminate={()=>{webViewRef.corrent?.reload();}}
        onLoad={() => console.log('WebView loaded')}
        onError={(e)=>console.log('WebView error:',e)}
        onMessage={(event) => console.log('Message from JS:', event.nativeEvent.data)}
      />
      <TouchableOpacity onPress={() => setKey(k=> k +1)}>
        <Text style={{color: '#fff', padding:10}}>Force Refresh WebView (test fix) </Text>
        
        </TouchableOpacity>
      <Text style={styles.note}>If black on iOS: ensure chunks are fragmented MP4 + H264 baseline.</Text>
    </View>
  );
}

const { height, width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, 
              backgroundColor: '#000',
  backgroundColor: '#000',
  borderWidth: 1,
  borderColor: 'transparent',
},
video: {flex:1},
});
