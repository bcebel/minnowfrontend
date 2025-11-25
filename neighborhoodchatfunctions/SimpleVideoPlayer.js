export const SimpleVideoPlayer = ({ url, fileName }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  return (
    <TouchableOpacity
      style={styles.videoContainer}
      onPress={() => player.play()}
    >
      <VideoView
        player={player}
        style={styles.videoPlayer}
        showsControls={true}
        contentFit="contain"
        allowsExternalPlayback={true}
      />
      {fileName && (
        <Text style={styles.videoCaption} numberOfLines={1}>
          {fileName}
        </Text>
      )}
    </TouchableOpacity>
  );
};