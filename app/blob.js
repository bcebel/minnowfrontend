import { CameraView, useCameraPermissions } from "expo-camera";
import { Blob } from "expo-blob";
import { useState, useRef } from "react";

export default function NeighborhoodCamera() {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [chunks, setChunks] = useState([]);

  const startRecording = async () => {
    if (cameraRef.current) {
      setRecording(true);
      setChunks([]);

      // Start recording - this returns a blob!
      const videoBlob = await cameraRef.current.recordAsync({
        quality: "720p",
        maxDuration: 60, // 1 minute chunks
      });

      // 🎯 BLOB CHUNKING TIME!
      chunkBlobForSwarming(videoBlob);
    }
  };

  const chunkBlobForSwarming = async (blob) => {
    const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
    const chunkPromises = [];

    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, blob.size);

      // 🎉 THIS IS THE MAGIC!
      const chunk = blob.slice(start, end, "video/mp4");
      chunkPromises.push(chunk);
    }

    // Now you have an array of blob chunks ready for WebTorrent!
    const allChunks = await Promise.all(chunkPromises);
    setChunks(allChunks);

    // Ready to swarm these chunks to the neighborhood
    await sendChunksToNeighborhood(allChunks);
  };

  const sendChunksToNeighborhood = async (chunks) => {
    chunks.forEach((chunk, index) => {
      // Each chunk becomes its own torrent
      const torrent = WebTorrent.seed(chunk, {
        name: `neighborhood-video-chunk-${Date.now()}-${index}`,
      });

      // Share magnet link in neighborhood chat
      neighborhoodChat.sendMessage({
        type: "video_chunk",
        magnet: torrent.magnetURI,
        chunkIndex: index,
        totalChunks: chunks.length,
      });
    });
  };

  const stopRecording = () => {
    if (cameraRef.current) {
      cameraRef.current.stopRecording();
      setRecording(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, recording && styles.recordingButton]}
            onPress={recording ? stopRecording : startRecording}
          >
            <Text style={styles.text}>
              {recording
                ? "Stop Recording"
                : "Start Recording for Neighborhood"}
            </Text>
          </TouchableOpacity>
        </View>
      </CameraView>

      {/* Show chunking progress */}
      {chunks.length > 0 && (
        <View style={styles.chunkInfo}>
          <Text>
            Created {chunks.length} chunks ready for neighborhood swarm!
          </Text>
        </View>
      )}
    </View>
  );
}
