import React, { useState } from "react";
import {
  View,
  Image,
  TouchableOpacity,
  Text,
  Alert,
    ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { NeighborhoodVideoReassembler } from "./NeighborhoodVideoReassembler";
import SimpleVideoPlayer from "./SimpleVideoPlayer";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

const ChatMediaRenderer = ({ message, allMessages = [] }) => {
  const {
    imageUrl,
    videoUrl,
    fileUrl,
    magnetLink,
    fileName,
    fileType,
    thumbnailUrl,
    sessionId,
    chunkIndex,
    totalChunks,
  } = message;

  const [showVideoPlayer, setShowVideoPlayer] = useState(false);
  const [torrentStreamUrl, setTorrentStreamUrl] = useState(null);
  const [isLoadingTorrent, setIsLoadingTorrent] = useState(false);
  const [isDownloadingChunks, setIsDownloadingChunks] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [chunkedVideoUrl, setChunkedVideoUrl] = useState(null);

  // Helper functions
  const getPinataUrl = (url) => {
    if (!url) return null;
    if (url.includes("/ipfs/")) {
      const cid = url.split("/ipfs/")[1];
      return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
    }
    return url;
  };

  const fetchChunksBySession = (targetSessionId) => {
    return allMessages
      .filter(
        (msg) =>
          msg.sessionId === targetSessionId && msg.fileType === "video_chunk"
      )
      .sort((a, b) => a.chunkIndex - b.chunkIndex);
  };
 const handleMultistreamVideo = async (magnetUri, sessionId, totalChunks) => {
   if (Platform.OS !== "web") {
     Alert.alert("Web Only", "Multistream videos require web browser");
     return;
   }

   setIsDownloadingChunks(true);

   try {
     const reassembler = new NeighborhoodVideoReassembler();

     // Use the new multistream method
     const blob = await reassembler.watchMultistream(
       magnetUri,
       sessionId,
       totalChunks,
       (downloaded, total) => {
         setDownloadProgress(Math.round((downloaded / total) * 100));
       }
     );

     const videoUrl = URL.createObjectURL(blob);
     setChunkedVideoUrl(videoUrl);
   } catch (error) {
     console.error("❌ Multistream video error:", error);
     Alert.alert("Playback Error", error.message);
   } finally {
     setIsDownloadingChunks(false);
   }
 };
  // 🎯 Handle chunked video playback
  const handleChunkedVideo = async (targetSessionId, targetTotalChunks) => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "Chunked videos require web browser");
      return;
    }

    setIsDownloadingChunks(true);

    try {
      const chunkMessages = fetchChunksBySession(targetSessionId);

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

  // 🎯 Handle multistream video
  if (message.fileType === "video_multistream") {
    if (chunkedVideoUrl) {
      // Show player if already downloaded
      return (
        <SimpleVideoPlayer url={chunkedVideoUrl} fileName={message.fileName} />
      );
    }

    return (
      <TouchableOpacity
        onPress={() =>
          handleMultistreamVideo(
            message.magnetLink,
            message.sessionId,
            message.totalChunks
          )
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
            <Text style={styles.multistreamBadge}>MULTISTREAM</Text>
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
              <Text style={styles.chunkCount}>
                {message.totalChunks} chunks
              </Text>
              <Text style={styles.streamType}>🌐 Multistream</Text>
            </View>
          )}
        </View>

        {message.fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {message.fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // 🎯 Add handler for multistream
 


  // 🎯 Handle magnet link playback
  const handleMagnetPlay = async (magnetUri) => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "P2P playback requires web browser");
      return;
    }

    setIsLoadingTorrent(true);

    try {
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const client = new window.WebTorrent();

      // Check if this might be a live stream
      const isLiveStream =
        magnetUri.includes("live") || fileName?.includes("LIVE");

      if (isLiveStream) {
        // Try live stream playback
        await handleLiveStream(magnetUri);
      } else {
        // Regular torrent playback
        client.add(magnetUri, (torrent) => {
          console.log("✅ Torrent loaded:", torrent.name);

          const file = torrent.files.find(
            (f) =>
              f.name.endsWith(".webm") ||
              f.name.endsWith(".mp4") ||
              f.name.endsWith(".mov")
          );

          if (file) {
            file.getBlobURL((err, url) => {
              if (err) {
                console.error("❌ Error getting blob URL:", err);
                Alert.alert("Playback Error", "Could not load video");
                setIsLoadingTorrent(false);
                return;
              }

              setTorrentStreamUrl(url);
              setShowVideoPlayer(true);
              setIsLoadingTorrent(false);
            });
          } else {
            console.error("❌ No video file found");
            Alert.alert("Playback Error", "No video file in torrent");
            setIsLoadingTorrent(false);
          }
        });
      }
    } catch (error) {
      console.error("❌ Torrent playback error:", error);
      Alert.alert("Playback Error", error.message);
      setIsLoadingTorrent(false);
    }
  };

  // 🎯 Handle live stream playback (separate function)
  const handleLiveStream = async (magnetUri) => {
    try {
      const client = new window.WebTorrent();

      client.add(magnetUri, { live: true }, (torrent) => {
        console.log("📥 Joining LIVE stream:", torrent.name);

        const file = torrent.files.find(
          (f) => f.name.endsWith(".webm") || f.name.includes("live")
        );

        if (file) {
          const video = document.createElement("video");
          video.controls = true;
          video.autoplay = true;
          video.style.cssText = `
            position: fixed; top: 50%; left: 50%; 
            transform: translate(-50%, -50%);
            width: 80vw; max-width: 800px;
            z-index: 2000; background: black;
            border: 3px solid #ff0000;
          `;

          file.streamTo(video);

          const closeBtn = document.createElement("button");
          closeBtn.textContent = "✕";
          closeBtn.style.cssText = `
            position: fixed; top: 20px; right: 20px;
            background: #ff0000; color: white;
            border: none; width: 40px; height: 40px;
            border-radius: 20px; font-size: 20px;
            z-index: 2001; cursor: pointer;
          `;

          closeBtn.onclick = () => {
            document.body.removeChild(video);
            document.body.removeChild(closeBtn);
          };

          document.body.appendChild(video);
          document.body.appendChild(closeBtn);
          setIsLoadingTorrent(false);
        }
      });
    } catch (error) {
      console.error("❌ Live stream join error:", error);
      Alert.alert("Stream Error", "Could not join live stream");
      setIsLoadingTorrent(false);
    }
  };

  // 🚨 RETURN NULL if no media
  const hasAnyMedia =
    imageUrl ||
    videoUrl ||
    fileUrl ||
    magnetLink ||
    fileType === "video_chunked";
  if (!hasAnyMedia) {
    return null;
  }

  // 🎯 RENDER LOGIC

  // 1. Chunked video master
  if (fileType === "video_chunked") {
    if (chunkedVideoUrl) {
      return <SimpleVideoPlayer url={chunkedVideoUrl} fileName={fileName} />;
    }

    return (
      <TouchableOpacity
        onPress={() => handleChunkedVideo(sessionId, totalChunks)}
        style={styles.chunkedVideoContainer}
        disabled={isDownloadingChunks}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
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
              <Text style={styles.chunkCount}>{totalChunks} parts</Text>
            </View>
          )}
        </View>

        {fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // 2. Individual chunk indicator
  if (fileType === "video_chunk") {
    return (
      <View style={styles.chunkIndicator}>
        <Text style={styles.chunkText}>
          🧩 Part {chunkIndex + 1}/{totalChunks}
        </Text>
      </View>
    );
  }

  // 3. Regular video with magnet link
  if (magnetLink && fileType === "video") {
    if (torrentStreamUrl) {
      return (
        <SimpleVideoPlayer
          url={torrentStreamUrl}
          fileName={fileName}
          isTorrent={true}
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
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎥</Text>
          </View>
        )}

        <View style={styles.videoOverlay}>
          {isLoadingTorrent ? (
            <ActivityIndicator size="large" color="#00ffff" />
          ) : (
            <View style={styles.playButton}>
              <Text style={styles.playIcon}>▶</Text>
            </View>
          )}
        </View>

        {fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // 4. Regular video (IPFS)
  if (videoUrl) {
    const pinataUrl = getPinataUrl(videoUrl);

    if (showVideoPlayer) {
      return <SimpleVideoPlayer url={pinataUrl} fileName={fileName} />;
    }

    return (
      <TouchableOpacity
        onPress={() => setShowVideoPlayer(true)}
        style={styles.videoThumbnailContainer}
      >
        {thumbnailUrl ? (
          <Image
            source={{ uri: thumbnailUrl }}
            style={styles.videoThumbnail}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.videoThumbnail, styles.videoPlaceholder]}>
            <Text style={styles.videoIcon}>🎥</Text>
          </View>
        )}

        <View style={styles.videoOverlay}>
          <View style={styles.playButton}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        </View>

        {fileName && (
          <Text style={styles.videoFileName} numberOfLines={1}>
            {fileName}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  // 5. Images
  if (imageUrl || fileType === "image") {
    const pinataUrl = getPinataUrl(imageUrl);
    return (
      <TouchableOpacity onPress={() => console.log("Open image")}>
        <Image
          source={{ uri: pinataUrl }}
          style={styles.messageImage}
          resizeMode="cover"
        />
        {fileName && <Text style={styles.fileNameText}>{fileName}</Text>}
      </TouchableOpacity>
    );
  }

  // 6. Files
  if (fileUrl) {
    return (
      <TouchableOpacity
        style={styles.fileContainer}
        onPress={() =>
          handleFilePress({ ...message, fileUrl: getPinataUrl(fileUrl) })
        }
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
};
const styles = StyleSheet.create({
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
  messageContent: {
    flex: 1,
  },
  username: {
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
    fontSize: 14,
  },
  messageText: {
    color: "#FFFFFF",
    marginBottom: 8,
    fontSize: 16,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: "#00AA00",
    opacity: 0.7,
  },
  // LARGER MEDIA STYLES
  messageImage: {
    width: "100%", // Will be controlled by parent
    maxWidth: "90%", // Maximum size on large screens
    height: undefined,
    aspectRatio: 4 / 3, // Maintain aspect ratio
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center", // Center the media
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
    maxWidth: 600, // Limit file container width
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
  streamButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: "#FF4444",
    borderRadius: 25,
    justifyContent: "center",
  },
  streamButtonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  // LARGER VIDEO PLAYER STYLES
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%", // Full width of message container
    maxWidth: 800, // Maximum size on large screens
    alignSelf: "center", // Center in message
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9, // Standard video aspect ratio
    backgroundColor: "#000",
  },
  videoCaption: {
    opacity: 0,
  },
  fileNameText: {
    opacity: 0,
  },
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
  adContent: {
    // Your ad content styles
  },
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
  videoFileName: {
    opacity: 0,
  },
  // Add to your StyleSheet:
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
    backgroundColor: "rgba(255, 0, 0, 0.8)", // Red for "live"
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
  multistreamBadge: {
    color: "#00ffff",
    fontSize: 10,
    fontWeight: "bold",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 4,
  },
  streamType: {
    color: "#00ffff",
    fontSize: 10,
    marginTop: 2,
  },
});


export default ChatMediaRenderer;
