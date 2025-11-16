function NeighborhoodVideoPlayer({ videoSessionId }) {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoUrl, setVideoUrl] = useState(null);

  const watchVideo = async () => {
    setIsLoading(true);
    setProgress(0);

    const reassembler = new NeighborhoodVideoReassembler();

    // Progress tracking
    reassembler.client.on("download", (bytes) => {
      setProgress((prev) => prev + bytes);
    });

    await reassembler.watchNeighborhoodVideo(videoSessionId);

    // Get the final blob URL for playback
    const finalBlob = reassembler.getAssembledBlob();
    setVideoUrl(URL.createObjectURL(finalBlob));
    setIsLoading(false);
  };

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loading}>
          <Text>Downloading from neighborhood swarm... {progress} bytes</Text>
          <ActivityIndicator size="large" />
        </View>
      ) : videoUrl ? (
        <video
          src={videoUrl}
          controls
          style={styles.video}
          onLoadStart={() =>
            console.log("Playing reassembled neighborhood video!")
          }
        />
      ) : (
        <TouchableOpacity style={styles.button} onPress={watchVideo}>
          <Text>Watch Neighborhood Video</Text>
          <Text style={styles.subtitle}>
            Download from {chunkCount} neighbors
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
