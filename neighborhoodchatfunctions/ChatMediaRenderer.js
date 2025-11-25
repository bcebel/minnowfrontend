// Unified Media Renderer
export const ChatMediaRenderer = ({ message }) => {
  const { imageUrl, videoUrl, fileUrl, magnetLink, fileName, fileType } =
    message;

  const viewableUrl = imageUrl || videoUrl || fileUrl;
  const processedUrl = viewableUrl?.replace("ipfs.filebase.io", PINATA_GATEWAY);

  // Image
  if (imageUrl) {
    return (
      <Image
        source={{ uri: processedUrl }}
        style={styles.messageImage}
        resizeMode="cover"
      />
    );
  }

  // Video with magnet link - WebTorrent
  if (magnetLink && (videoUrl || fileType === "video")) {
    return <WebTorrentWebView video={message} />;
  }

  // Direct video URL - Simple Video Player
  if (videoUrl) {
    return (
      <SimpleVideoPlayer url={processedUrl} fileName={fileName || "Video"} />
    );
  }

  // Files
  if (fileUrl) {
    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() => handleFilePress(message)}
      >
        <Text style={styles.fileIcon}>
          {fileType === "document"
            ? "📄"
            : fileType === "image"
            ? "🖼️"
            : fileType === "video"
            ? "🎬"
            : "📎"}
        </Text>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || "File"}
          </Text>
          <Text style={styles.fileType}>
            {fileType || "File"} • Tap to download
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return null;
};