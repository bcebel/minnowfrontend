// components/ChunkedVideoManager.js
import { NeighborhoodVideoReassembler } from "./NeighborhoodVideoReassembler";
// In NeighborhoodVideoReassembler.js
async watchMultistream(magnetUri, sessionId, totalChunks) {
  if (!this.client) await this.init();
  
  return new Promise((resolve) => {
    this.client.add(magnetUri, (torrent) => {
      console.log("🎯 Multistream torrent loaded:", torrent.name);
      console.log("📁 Files in torrent:", torrent.files.length);
      
      let downloadedChunks = 0;
      const chunkBlobs = new Array(totalChunks);
      
      // Download chunks in order (or prioritize first few for progressive playback)
      for (let i = 0; i < Math.min(3, totalChunks); i++) {
        this.downloadChunkFromMultistream(torrent, i, chunkBlobs, () => {
          downloadedChunks++;
          if (this.onChunkDownload) {
            this.onChunkDownload(downloadedChunks, totalChunks);
          }
          
          // Start playing after 2 chunks
          if (downloadedChunks >= 2) {
            const availableChunks = chunkBlobs.slice(0, downloadedChunks).filter(Boolean);
            const partialBlob = new Blob(availableChunks, { type: 'video/mp4' });
            // You could emit this for progressive playback
          }
          
          if (downloadedChunks === totalChunks) {
            const finalBlob = new Blob(chunkBlobs, { type: 'video/mp4' });
            resolve(finalBlob);
          }
        });
      }
      
      // Continue downloading rest
      for (let i = 3; i < totalChunks; i++) {
        this.downloadChunkFromMultistream(torrent, i, chunkBlobs, () => {
          downloadedChunks++;
          if (this.onChunkDownload) {
            this.onChunkDownload(downloadedChunks, totalChunks);
          }
          
          if (downloadedChunks === totalChunks) {
            const finalBlob = new Blob(chunkBlobs, { type: 'video/mp4' });
            resolve(finalBlob);
          }
        });
      }
    });
  });
}

downloadChunkFromMultistream(torrent, chunkIndex, chunkBlobs, callback) {
  const fileName = `chunk_${chunkIndex}.mp4`;
  const file = torrent.files.find(f => f.name === fileName);
  
  if (!file) {
    console.error(`❌ Chunk ${chunkIndex} not found in torrent`);
    callback();
    return;
  }
  
  file.getBlob((err, blob) => {
    if (err) {
      console.error(`❌ Error downloading chunk ${chunkIndex}:`, err);
      callback();
      return;
    }
    
    chunkBlobs[chunkIndex] = blob;
    callback();
  });
}
export default function ChunkedVideoManager({ sessionId }) {
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);
  const [downloadedChunks, setDownloadedChunks] = useState(0);
  const [totalChunks, setTotalChunks] = useState(0);

  const startDownload = async () => {
    const reassembler = new NeighborhoodVideoReassembler();

    // Listen for chunk downloads
    reassembler.client.on("download", (bytes) => {
      setProgress((prev) => prev + bytes);
    });

    // Get chunk count from chat
    const chunks = await getChunksFromChat(sessionId);
    setTotalChunks(chunks.length);

    // Progressive download
    reassembler
      .watchProgressive(chunks, (chunkIndex) => {
        setDownloadedChunks(chunkIndex + 1);
      })
      .then((finalBlob) => {
        setVideoUrl(URL.createObjectURL(finalBlob));
      });
  };

  return (
    <View style={styles.container}>
      {!videoUrl ? (
        <>
          <Text>🧩 Downloading from neighborhood...</Text>
          <Text>
            {downloadedChunks}/{totalChunks} chunks
          </Text>
          <ProgressBar progress={downloadedChunks / totalChunks} />
          <Button title="Start Download" onPress={startDownload} />
        </>
      ) : (
        <video src={videoUrl} controls style={styles.video} />
      )}
    </View>
  );
}
