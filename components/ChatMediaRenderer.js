import React, {
  useState,
} from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
} from "react-native";
import WebTorrentMedia from "./WebTorrentMedia";
import { NeighborhoodVideoReassembler } from "./NeighborhoodVideoReassembler"; 

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

const SimpleVideoPlayer = ({ url, fileName, isTorrent = false }) => {
  // Simple implementation - you need to add your actual video player logic
  return (
    <View style={styles.videoContainer}>
      <Text>Video Player for: {fileName || 'Video'}</Text>
    </View>
  );
};

function ChatMediaRenderer({ message }) {
  if (message.fileType === "video_chunk") {
    return null;
  }

  const {
    imageUrl,
    videoUrl,
    fileUrl,
    magnetLink,
    fileName,
    fileType,
    thumbnailUrl,
  } = message;

  if (!message) return null;

  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [torrentStreamUrl, setTorrentStreamUrl] = useState(null);
  const [isLoadingTorrent, setIsLoadingTorrent] = useState(false);
  const [isDownloadingChunks, setIsDownloadingChunks] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState(null);

  const handleChunkedVideo = async (sessionId, totalChunks) => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "Chunked videos require web browser");
      return;
    }

    setIsDownloadingChunks(true);

    try {
      const chunkMessages = await fetchChunksBySession(sessionId);

      if (chunkMessages.length === 0) {
        Alert.alert("No Chunks", "Video chunks not found in chat");
        return;
      }

      const reassembler = new NeighborhoodVideoReassembler();
      reassembler.onChunkDownload = (downloaded, total) => {
        setDownloadProgress(Math.round((downloaded / total) * 100));
      };

      const blob = await reassembler.watchProgressive(
        chunkMessages,
        (downloaded, total) => {
          setDownloadProgress(Math.round((downloaded / total) * 100));
        }
      );

      const videoUrl = URL.createObjectURL(blob);
      setChunkedVideoUrl(videoUrl);
    } catch (error) {
      console.error("❌ Chunked video error:", error);
      Alert.alert("Playback Error", error.message);
    } finally {
      setIsDownloadingChunks(false);
    }
  };

  const handleMagnetPlay = async (magnetUri) => {
    if (Platform.OS !== "web") return;
    setIsLoadingTorrent(true);

    try {
      let client = window.globalWebTorrentClient;
      if (!client) {
        console.warn("🔧 Creating global WebTorrent client on-demand");
        client = new window.WebTorrent();
        window.globalWebTorrentClient = client;
      }

      const existing = client.get(magnetUri);
      if (existing) {
        const file = existing.files.find(
          (f) => f.name.endsWith(".webm") || f.name.endsWith(".mp4")
        );
        if (file) {
          createVideoPlayer(file, existing);
          setIsLoadingTorrent(false);
          return;
        }
      }

      client.add(magnetUri, { live: true }, (torrent) => {
        torrent.on("error", (err) => {
          console.error("❌ Torrent error:", err);
          Alert.alert("Stream Error", err.message);
          setIsLoadingTorrent(false);
        });

        if (!torrent.ready) {
          torrent.once("ready", () => readyHandler(torrent));
        } else {
          readyHandler(torrent);
        }
      });
    } catch (err) {
      console.error("💥 handleMagnetPlay error:", err);
      Alert.alert("Playback Failed", err.message);
      setIsLoadingTorrent(false);
    }

    function readyHandler(torrent) {
      const file = torrent.files.find(
        (f) => f.name.endsWith(".webm") || f.name.endsWith(".mp4")
      );

      if (!file) {
        Alert.alert("❌ No video", "No .webm/.mp4 file in torrent");
        setIsLoadingTorrent(false);
        return;
      }

      console.log("🎬 Found file:", file.name);
      createVideoPlayer(file, torrent);
      setIsLoadingTorrent(false);
    }
  };

  const createVideoPlayer = (file, torrent) => {
    console.log(`📹 Creating player for: ${file.name}`);

    const container = document.createElement("div");
    container.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.95); z-index: 9998;
      display: flex; flex-direction: column; 
      align-items: center; justify-content: center;
      padding: 20px;
    `;

    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.style.cssText = `
      width: 100%; max-width: 800px; max-height: 80vh;
      background: black; border: 2px solid #00ff00;
      border-radius: 8px;
    `;

    const statusDiv = document.createElement("div");
    statusDiv.style.cssText = `
      color: white; margin-top: 20px; text-align: center;
      font-family: monospace; font-size: 14px;
    `;

    const updateStatus = (msg) => {
      statusDiv.textContent = `🔄 ${msg}`;
    };

    container.appendChild(video);
    container.appendChild(statusDiv);

    updateStatus("Method 1: Creating blob URL...");
    file.getBlobURL((err, blobUrl) => {
      if (!err && blobUrl) {
        video.src = blobUrl;
        updateStatus("✅ Playing via blob URL");
        return;
      }

      console.warn("❌ Blob URL failed:", err?.message);
      updateStatus("Method 2: Creating read stream...");

      try {
        function getMediaSource() {
          return self.ManagedMediaSource || self.MediaSource;
        }

        const mediaSource = getMediaSource();
        video.src = URL.createObjectURL(mediaSource);
        video.disableRemotePlayback = true;

        mediaSource.addEventListener("sourceopen", () => {
          updateStatus("Creating stream source...");

          try {
            const mimeType = 'video/webm; codecs="vp8,opus"';
            const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
            const stream = file.createReadStream();
            let isBuffering = false;
            const bufferQueue = [];

            updateStatus("Starting stream...");

            stream.on("data", (chunk) => {
              bufferQueue.push(chunk);
              processBuffer();
            });

            stream.on("end", () => {
              console.log("✅ Stream download complete");
              if (!isBuffering && bufferQueue.length === 0) {
                mediaSource.endOfStream();
                updateStatus("✅ Stream complete");
              }
            });

            function processBuffer() {
              if (isBuffering || bufferQueue.length === 0) return;

              if (sourceBuffer.updating) {
                setTimeout(processBuffer, 50);
                return;
              }

              isBuffering = true;
              const chunk = bufferQueue.shift();

              try {
                sourceBuffer.appendBuffer(chunk);
              } catch (err) {
                console.error("❌ Buffer append error:", err);
                if (err.name === "NotSupportedError") {
                  updateStatus("Trying MP4 fallback...");
                  try {
                    mediaSource.removeSourceBuffer(sourceBuffer);
                    const altMime = 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"';
                    const newBuffer = mediaSource.addSourceBuffer(altMime);
                    newBuffer.appendBuffer(chunk);
                  } catch (altErr) {
                    console.error("Alt codec failed:", altErr);
                    fallbackToDownload();
                  }
                }
              }
            }

            sourceBuffer.addEventListener("updateend", () => {
              isBuffering = false;
              processBuffer();

              if (video.paused && mediaSource.readyState === "open") {
                video
                  .play()
                  .catch((e) => console.warn("Auto-play blocked:", e));
              }
            });

            sourceBuffer.addEventListener("error", (e) => {
              console.error("SourceBuffer error:", e);
              updateStatus("Buffer error, trying fallback...");
              fallbackToDownload();
            });
          } catch (error) {
            console.error("❌ Source setup failed:", error);
            updateStatus(`Error: ${error.message}`);
            fallbackToDownload();
          }
        });
      } catch (streamErr) {
        console.error("Stream creation failed:", streamErr);
        fallbackToDownload();
      }
    });

    function fallbackToDownload() {
      updateStatus("Creating direct download...");

      file.getBlob((err, blob) => {
        if (err) {
          console.error("Blob creation failed:", err);
          video.innerHTML = `
            <div style="color: white; padding: 40px; text-align: center;">
              <h3>❌ Playback Failed</h3>
              <p>${err.message || "Unknown error"}</p>
              <p>Torrent: ${torrent.name}</p>
              <p>Peers: ${torrent.numPeers}</p>
              <p>Progress: ${(torrent.progress * 100).toFixed(1)}%</p>
            </div>
          `;
          return;
        }

        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download = file.name;
        downloadLink.textContent = `📥 Download ${file.name} (${(
          blob.size /
          1024 /
          1024
        ).toFixed(2)} MB)`;
        downloadLink.style.cssText = `
          display: inline-block; background: #0066cc;
          color: white; padding: 12px 24px; border-radius: 6px;
          text-decoration: none; margin-top: 20px; font-weight: bold;
        `;

        video.style.display = "none";
        container.appendChild(downloadLink);
        updateStatus("✅ Ready for download");
      });
    }

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "✕ CLOSE PLAYER";
    closeBtn.style.cssText = `
      position: fixed; top: 20px; right: 20px;
      background: #ff4444; color: white; border: none;
      padding: 10px 20px; border-radius: 6px;
      font-weight: bold; cursor: pointer; z-index: 10000;
    `;
    closeBtn.onclick = () => {
      document.body.removeChild(container);
      document.body.removeChild(closeBtn);
    };

    document.body.appendChild(container);
    document.body.appendChild(closeBtn);
  };

  const fetchChunksBySession = async (sessionId) => {
    return [];
  };

  if (message.fileType === "video_chunk") {
    return null;
  }

  if (message.fileType === "video_chunked") {
    if (chunkedVideoUrl) {
      return (
        <SimpleVideoPlayer url={chunkedVideoUrl} fileName={message.fileName} />
      );
    }

    return (
      <TouchableOpacity
        onPress={() =>
          handleChunkedVideo(message.sessionId, message.totalChunks)
        }
        style={styles.chunkedVideoContainer}
        disabled={isDownloadingChunks}
      >
        {message.thumbnailUrl ? (
          <Image
            source={{ uri: message.thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎬</Text>
          </View>
        )}

        <View style={styles.videoOverlay}>
          {isDownloadingChunks ? (
            <View style={styles.downloadProgress}>
              <ActivityIndicator size="large" color="#00ffff" />
              <Text style={styles.progressText}>{downloadProgress}%</Text>
            </View>
          ) : (
            <View style={styles.chunkPlayButton}>
              <Text style={styles.playIcon}>▶</Text>
              <Text style={styles.chunkCount}>{message.totalChunks} parts</Text>
            </View>
          )}
        </View>

        {message.fileName ? (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {message.fileName}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  const getPinataUrl = (url) => {
    if (!url) return null;
    if (url.includes("/ipfs/")) {
      const cid = url.split("/ipfs/")[1];
      return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }
    return url;
  };

  if (videoUrl) {
    const pinataUrl = getPinataUrl(videoUrl);

    if (showVideoPlayer) {
      return (
        <SimpleVideoPlayer url={pinataUrl} fileName={fileName || "Video"} />
      );
    }

    return (
      <TouchableOpacity
        onPress={() => setShowVideoPlayer(true)}
        style={styles.videoThumbnailContainer}
      >
        <Image
          source={{ uri: thumbnailUrl }}
          style={styles.videoThumbnail}
          resizeMode="cover"
        />
        <View style={styles.videoOverlay}>
          <Text style={styles.playIcon}>▶️</Text>
        </View>
        {fileName ? (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  if (magnetLink && fileType === "video") {
    if (torrentStreamUrl) {
      return (
        <SimpleVideoPlayer
          url={torrentStreamUrl}
          fileName={fileName || "Live Stream"}
        />
      );
    }

    return (
      <TouchableOpacity
        onPress={() => handleMagnetPlay(magnetLink)}
        style={styles.videoThumbnailContainer}
        disabled={isLoadingTorrent}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.streamPlaceholder]}>
            <Text style={styles.streamIcon}>🎥</Text>
            <Text style={styles.streamText}>LIVE STREAM</Text>
          </View>
        )}

        <View style={styles.videoOverlay}>
          {isLoadingTorrent ? (
            <ActivityIndicator size="large" color="#00ffff" />
          ) : (
            <View style={styles.streamPlayButton}>
              <Text style={styles.streamPlayIcon}>▶</Text>
            </View>
          )}
        </View>

        {fileName ? (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  }

  if (magnetLink && (fileType === "image" || fileType === "video")) {
    return (
      <View style={styles.magnetContainer}>
        <WebTorrentMedia media={message} isFocused={true} />
      </View>
    );
  }

  if (imageUrl || fileType === "image") {
    const pinataUrl = getPinataUrl(imageUrl);
    return (
      <TouchableOpacity onPress={() => console.log("Open image:", pinataUrl)}>
        <Image
          source={{ uri: pinataUrl }}
          style={styles.messageImage}
          resizeMode="cover"
        />
        {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
      </TouchableOpacity>
    );
  }

  if (fileUrl) {
    const pinataUrl = getPinataUrl(fileUrl);
    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() => handleFilePress({ ...message, fileUrl: pinataUrl })}
      >
        <Text style={styles.fileIcon}>📄</Text>
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
}

const styles = StyleSheet.create({
  messageContent: {
    flexShrink: 1,
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 4,
  },
  timestamp: {
    fontSize: 10,
    color: "#888",
    marginRight: 10,
  },
  deleteButton: {
    position: "absolute",
    right: 0,
    top: 0,
    padding: 5,
  },
  deleteIcon: {
    fontSize: 14,
    color: "red",
  },
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "#000000",
    padding: 5,
  },
  loadingText: {
    color: "#00ffff",
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: "#FF4444",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  errorDetail: {
    color: "#FF8888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00ffff",
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  roomTitle: {
    fontSize: 18,
    color: "#00ffff",
    fontWeight: "bold",
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: "#00ffff",
  },
  connectionWarning: {
    backgroundColor: "#331100",
    padding: 8,
    alignItems: "center",
  },
  warningText: {
    fontSize: 12,
    color: "#FFAA00",
  },
  messagesList: {
    flex: 1,
  },
  messageContainer: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#333333",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  username: {
    fontWeight: "bold",
    color: "#00ffff",
    fontSize: 14,
  },
  messageText: {
    color: "#FFFFFF",
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 8,
  },
  sharedLabel: {
    color: "#00AA00",
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 4,
    marginBottom: 8,
  },
  messageImage: {
    width: "100%",
    maxWidth: "90%",
    height: undefined,
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333333",
    maxWidth: 600,
    alignSelf: "center",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  fileType: {
    color: "#00AA00",
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#00ffff",
    backgroundColor: "#111111",
    alignItems: "center",
  },
  messageInput: {
    flex: 1,
    backgroundColor: "#000000",
    borderWidth: 2,
    borderColor: "#00ffff",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: "#00ffff",
    marginRight: 10,
    fontSize: 16,
  },
  messageInputDisabled: {
    borderColor: "#333333",
    color: "#666666",
  },
  sendButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#333333",
  },
  sendButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 16,
  },
  uploadButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: "#333333",
    borderRadius: 25,
    justifyContent: "center",
  },
  uploadButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },
  retryButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: "#000000",
    fontWeight: "bold",
  },
  membersButton: {
    padding: 8,
  },
  membersButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  videoCaption: {
    display: "none",
  },
  fileNameText: { display: "none" },
  adContainer: {
    backgroundColor: "#1a1a1a",
    borderLeftWidth: 4,
    borderLeftColor: "#00ffff",
    margin: 10,
    padding: 12,
    borderRadius: 8,
  },
  adHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  adBadge: {
    color: "#00ffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  adContent: {},
  adTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  adDescription: {
    color: "#cccccc",
    fontSize: 14,
    marginBottom: 8,
  },
  adButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  adButtonText: {
    color: "#000000",
    fontWeight: "bold",
    fontSize: 14,
  },
  adUrl: {
    color: "#888888",
    fontSize: 12,
    fontStyle: "italic",
  },
  galleryButtonText: {
    fontSize: 16,
    color: "#00ffff",
  },
  videoThumbnailContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  videoThumbnail: {
    minWidth: 200,
    minHeight: 900,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playIcon: {
    fontSize: 40,
  },
  videoFileName: { display: "none" },
  streamPlaceholder: {
    backgroundColor: "#1a1a1a",
    justifyContent: "center",
    alignItems: "center",
  },
  streamIcon: {
    fontSize: 48,
    color: "#00ffff",
    marginBottom: 8,
  },
  streamText: {
    color: "#00ffff",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  streamPlayButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  streamPlayIcon: {
    fontSize: 32,
    color: "#fff",
    marginLeft: 4,
  },
  chunkedVideoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
    position: "relative",
  },
  chunkPlayButton: {
    alignItems: "center",
  },
  chunkCount: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  downloadProgress: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 10,
    borderRadius: 20,
  },
  progressText: {
    color: "#00ffff",
    fontSize: 14,
    marginTop: 4,
  },
  chunkIndicator: {
    backgroundColor: "#1a1a1a",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  chunkText: {
    color: "#888",
    fontSize: 11,
  },
  inviteLinksButton: {
    backgroundColor: "#000000",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 10,
  },
  inviteLinksButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  liveStreamCard: {
    backgroundColor: "#ffeded",
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#ff4444",
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#ff4444",
    marginBottom: 4,
  },
  magnetLink: {
    fontSize: 13,
    color: "#0066cc",
    textDecorationLine: "underline",
    marginBottom: 8,
  },
  playButton: {
    backgroundColor: "#0066cc",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  playButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  streamButton: {
    padding: 12,
    marginHorizontal: 5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  startStreamButton: {
    backgroundColor: "#00AA00",
  },
  stopStreamButton: {
    backgroundColor: "#FF3333",
  },
  streamButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  floatingAdContainer: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "#1a1a1a",
    borderRadius: 12,
    padding: 15,
    borderWidth: 2,
    borderColor: "#00ffff",
    zIndex: 1000,
  },
  closeAdButton: {
    position: "absolute",
    top: 5,
    right: 5,
    padding: 5,
  },
  closeAdText: {
    color: "#fff",
    fontSize: 16,
  },
});

export default ChatMediaRenderer;
