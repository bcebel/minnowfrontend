// components/ChunkedVideoManager.js
import { NeighborhoodVideoReassembler } from "./NeighborhoodVideoReassembler";

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
