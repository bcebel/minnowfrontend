// components/WebTorrentMedia.js
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentMedia({ media, isFocused }) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const torrentRef = useRef(null);

  const { magnetLink, fileName, fileType } = media;

  const getOptimalStrategy = (fileType, fileName) => {
    if (fileType === "video") {
      return "sequential"; // 🎬 Videos need order
    } else if (fileType === "image") {
      return "rarest"; // 🖼️ Images want speed
    } else {
      return "rarest"; // Default for documents, etc.
    }
  };

  const strategy = getOptimalStrategy(fileType, fileName);

  // Extract CID from various sources
  const extractCID = () => {
    if (media.cid) return media.cid;
    if (fileName) {
      const cidFromFileName = fileName.split(".")[0];
      if (
        cidFromFileName.startsWith("Qm") ||
        cidFromFileName.startsWith("baf")
      ) {
        return cidFromFileName;
      }
    }
    if (media.imageUrl?.includes("/ipfs/")) {
      return media.imageUrl.split("/ipfs/")[1];
    }
    if (media.videoUrl?.includes("/ipfs/")) {
      return media.videoUrl.split("/ipfs/")[1];
    }
    return null;
  };

  const cid = extractCID();
  const isImage = fileType === "image";
  const isVideo = fileType === "video";

  useEffect(() => {
    if (Platform.OS !== "web") {
      // For native, use direct IPFS URL
      if (cid) {
        setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
      }
      setStatus("Loaded via IPFS");
      return;
    }

    const loadMedia = async () => {
      try {
        const client = window.globalWebTorrentClient;

        // If no magnet link, use direct IPFS
        if (!magnetLink || !cid) {
          console.log("📁 No magnet link, using direct IPFS");
          if (cid) {
            setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
          }
          setStatus("Loaded via IPFS");
          return;
        }

        if (!client) {
          throw new Error("Global WebTorrent client not found");
        }

        setStatus(`Connecting to P2P swarm (${strategy} mode)...`);

        // Check if torrent already exists
        let torrent = client.get(magnetLink);

        if (!torrent) {
          // 🎯 CRITICAL: Add with optimal strategy
          torrent = client.add(magnetLink, {
            strategy: strategy, // This is the key!

            // Optimize based on media type
            ...(isVideo
              ? {
                  storeCacheSlots: 20, // Larger cache for videos
                  preloadStoreSize: 10 * 1024 * 1024, // Preload 10MB
                  destroyStoreOnDestroy: false, // Keep in cache
                }
              : {
                  storeCacheSlots: 5, // Smaller cache for images
                  preloadStoreSize: 2 * 1024 * 1024, // Preload 2MB
                }),
          });
        }

        torrentRef.current = torrent;

        // Add web seed for faster loading
        if (cid) {
          torrent.addWebSeed(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
        }

        torrent.on("download", () => {
          const percent = Math.round(torrent.progress * 100);
          setProgress(percent);
          setPeers(torrent.numPeers);

          // Different status messages based on strategy
          if (strategy === "sequential") {
            setStatus(`Streaming: ${percent}% from ${torrent.numPeers} peers`);
          } else {
            setStatus(`Loading: ${percent}% from ${torrent.numPeers} peers`);
          }

          // Start loading media when we have some data
          // Different thresholds based on media type and strategy
          const loadThreshold = isVideo ? 5 : 2; // Video needs 5%, images need 2%

          if (percent >= loadThreshold && !mediaUrl) {
            let file;

            if (isImage) {
              // Look for image files
              file = torrent.files.find((f) =>
                f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
              );
            } else {
              // Look for video files
              file = torrent.files.find((f) =>
                f.name.match(/\.(mp4|mov|webm|avi|mkv)$/i)
              );
            }

            if (file) {
              file.getBlobURL((err, url) => {
                if (!err) {
                  setMediaUrl(url);
                  setStatus(isImage ? "Image loaded via P2P" : "Ready to play");
                }
              });
            }
          }
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, using IPFS");
          if (cid) {
            setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
          }
        });

        // Different timeouts based on media type
        const timeoutDuration = isVideo ? 3000 : 1000; // Videos get longer timeout

        // Timeout fallback
        setTimeout(
          () => {
            if (!mediaUrl && cid) {
              setStatus("P2P timeout, using IPFS");
              setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
            }
          },
          isFocused ? timeoutDuration : timeoutDuration * 3
        );
      } catch (error) {
        console.error("Error loading media:", error);
        setStatus("Error, using IPFS fallback");
        if (cid) {
          setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
        }
      }
    };

    loadMedia();

    return () => {
      // Keep torrent alive for seeding
      console.log("Keeping torrent alive for seeding");
    };
  }, [magnetLink, cid, isFocused, isImage, strategy]); // Added strategy to dependencies

  // Video controls
  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
      setStatus("Playing");
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
      setStatus("Stopped");
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setStatus("Playback ended");
  };

  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        {isImage ? (
          <Image
            source={{ uri: `https://${PINATA_GATEWAY}/ipfs/${cid}` }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.status}></Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {mediaUrl ? (
        <View style={styles.mediaWrapper}>
          {isImage ? (
            <Image
              source={{ uri: mediaUrl }}
              style={styles.image}
              resizeMode="contain"
              onLoad={() => console.log("✅ Image loaded via", status)}
              onError={() => {
                console.log("❌ Image load failed, falling back to IPFS");
                setStatus("Image load failed");
                if (cid) {
                  setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
                }
              }}
            />
          ) : (
            <>
              <video
                ref={videoRef}
                src={mediaUrl}
                controls
                style={styles.video}
                onLoadStart={() => console.log("Video loading")}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={handleVideoEnd}
                onError={() => {
                  setStatus("Video load failed");
                  if (cid) {
                    setMediaUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
                  }
                }}
              />

              {/* Custom video controls */}
              <View style={styles.controls}>
                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    isPlaying ? styles.stopButton : styles.playButton,
                  ]}
                  onPress={isPlaying ? handleStop : handlePlay}
                >
                  <Text style={styles.controlButtonText}>
                    {isPlaying ? "⏹️ Stop" : "▶️ Play"}
                  </Text>
                </TouchableOpacity>

                <View style={styles.statusInfo}>
                  <Text style={styles.statusText}>{status}</Text>
                  <Text style={styles.peerText}>{peers} peers</Text>
                  <Text style={styles.strategyText}>
                    {strategy === "sequential" ? "🎬 Stream" : "⚡ Quick Load"}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.progress}>
            {progress}% • {peers} peers
          </Text>
          <Text style={styles.strategyInfo}>
            Mode:{" "}
            {strategy === "sequential" ? "Streaming optimized" : "Fast preview"}
          </Text>
          {progress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      )}

      {/* Media info */}
      <View style={styles.mediaInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || (isImage ? "Image" : "Video")}
        </Text>
        {magnetLink && (
          <Text style={styles.magnetHint}>
            🔗 P2P {isImage ? "Image" : "Video"} - {peers} peers seeding
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({

  container: {
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 12,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  
  mediaWrapper: {
    position: "relative",
  },
  image: {
    width: "100%",
    height: undefined,
    aspectRatio: 4 / 3,
    minHeight: 300,
  },
  video: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
    minHeight: 300,
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "rgba(0, 0, 0, 0.9)",
  },
  controlButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "#00ffff",
  },
  stopButton: {
    backgroundColor: "#FF4444",
  },
  controlButtonText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 14,
  },
  statusInfo: {
    alignItems: "flex-end",
  },
  statusText: {
    color: "#FFF",
    fontSize: 14,
  },
  peerText: {
    color: "#00ffff",
    fontSize: 12,
  },

  strategyText: {

    fontSize: 10,
    marginTop: 2,
  },
  loadingContainer: {
    height: 400,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 20,
  },
  status: {
    color: "#FFF",
    textAlign: "center",
    marginBottom: 12,
    fontSize: 16,
  },
  progress: {
    color: "#00ffff",
    fontSize: 14,
    marginBottom: 8,
  },
  strategyInfo: {
    fontSize: 12,
    marginBottom: 12,
  },
  progressBar: {
    width: "80%",
    height: 6,
    backgroundColor: "#333",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#00ffff",
    borderRadius: 3,
  },
  mediaInfo: {
    padding: 12,
    backgroundColor: "#111",
  },
  fileName: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  magnetHint: {
    color: "#00ffff",
    fontSize: 12,
    marginTop: 4,
  },
});
