// components/WebTorrentMedia.js
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

import { Image } from "expo-image";
import * as FileSystem from "expo-file-system"; // 1. Import FileSystem

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

// 2. Define a dedicated cache folder for our P2P media
const CACHE_FOLDER = `${FileSystem.cacheDirectory}webtorrent_media/`;

// Helper to ensure cache directory exists
const ensureDirExists = async () => {
  const dirInfo = await FileSystem.getInfoAsync(CACHE_FOLDER);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_FOLDER, { intermediates: true });
  }
};

export default function WebTorrentMedia({ media, isFocused }) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCachedLocally, setIsCachedLocally] = useState(false); // Track source

  const videoRef = useRef(null);
  const torrentRef = useRef(null);

  const { magnetLink, fileName, fileType } = media;

  const getOptimalStrategy = (fileType, fileName) => {
    if (fileType === "video") return "sequential"; // 🎬 Videos need order
    if (fileType === "image") return "rarest"; // 🖼️ Images want speed
    return "rarest";
  };

  const strategy = getOptimalStrategy(fileType, fileName);

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
  const ipfsUrl = `https://${PINATA_GATEWAY}/ipfs/${cid}`;

  // 3. Helper to save Blob to FileSystem (for Videos)
  const saveBlobToCache = async (blobUrl, filename) => {
    try {
      // FileSystem write only works reliably on native apps, not web
      if (Platform.OS === "web") return;

      await ensureDirExists();
      const localUri = CACHE_FOLDER + filename;

      // Fetch blob data
      const response = await fetch(blobUrl);
      const blob = await response.blob();

      // Convert to base64 to write to disk
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result.split(",")[1];
        await FileSystem.writeAsStringAsync(localUri, base64data, {
          encoding: FileSystem.EncodingType.Base64,
        });
        console.log("💾 Video saved to local cache:", localUri);
      };
    } catch (e) {
      console.warn("Failed to save video to cache:", e);
    }
  };

  useEffect(() => {
    // ---------------------------------------------------------
    // NATIVE APP LOGIC (Simplified for this snippet)
    // ---------------------------------------------------------
    if (Platform.OS !== "web") {
      if (cid) {
        setMediaUrl(ipfsUrl);
      }
      setStatus("Loaded via IPFS");
      return;
    }

    // ---------------------------------------------------------
    // WEB / P2P LOGIC
    // ---------------------------------------------------------
    const loadMedia = async () => {
      // --- CACHE CHECK START ---
      try {
        if (isImage) {
          // A. Image Cache Check (using expo-image internal cache)
          const cachedPath = await Image.getCachePathAsync(ipfsUrl);
          if (cachedPath) {
            console.log("💾 Image found in Expo Cache");
            setMediaUrl(ipfsUrl); // Expo Image will pick it up instantly from disk
            setStatus("Ready (Cached)");
            setIsCachedLocally(true);
            return; // 🛑 EXIT: Skip P2P
          }
        } else if (isVideo) {
          // B. Video Cache Check (Manual FileSystem check)
          const cacheFilename = `${cid}.mp4`;
          const localUri = CACHE_FOLDER + cacheFilename;
          const fileInfo = await FileSystem.getInfoAsync(localUri);

          if (fileInfo.exists) {
            console.log("💾 Video found in Local Cache");
            setMediaUrl(localUri);
            setStatus("Ready (Local Cache)");
            setIsCachedLocally(true);
            return; // 🛑 EXIT: Skip P2P
          }
        }
      } catch (err) {
        console.warn("Cache check skipped:", err);
      }
      // --- CACHE CHECK END ---

      try {
        const client = window.globalWebTorrentClient;

        if (!magnetLink || !cid) {
          console.log("📁 No magnet link, using direct IPFS");
          if (cid) setMediaUrl(ipfsUrl);
          setStatus("Loaded via IPFS");
          return;
        }

        if (!client) throw new Error("Global WebTorrent client not found");

        setStatus(`Connecting to P2P swarm (${strategy} mode)...`);

        let torrent = client.get(magnetLink);

        if (!torrent) {
          torrent = client.add(magnetLink, {
            strategy: strategy,
            ...(isVideo
              ? {
                  storeCacheSlots: 20,
                  preloadStoreSize: 10 * 1024 * 1024,
                  destroyStoreOnDestroy: false,
                }
              : {
                  storeCacheSlots: 5,
                  preloadStoreSize: 2 * 1024 * 1024,
                }),
          });
        }

        torrentRef.current = torrent;

        if (cid) {
          torrent.addWebSeed(ipfsUrl);
        }

        torrent.on("download", () => {
          const percent = Math.round(torrent.progress * 100);
          setProgress(percent);
          setPeers(torrent.numPeers);

          if (strategy === "sequential") {
            setStatus(`Streaming: ${percent}% from ${torrent.numPeers} peers`);
          } else {
            setStatus(`Loading: ${percent}% from ${torrent.numPeers} peers`);
          }

          const loadThreshold = isVideo ? 5 : 2;

          if (percent >= loadThreshold && !mediaUrl) {
            let file;

            if (isImage) {
              file = torrent.files.find((f) =>
                f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
              );
            } else {
              file = torrent.files.find((f) =>
                f.name.match(/\.(mp4|mov|webm|avi|mkv)$/i)
              );
            }

            if (file) {
              file.getBlobURL((err, url) => {
                if (!err) {
                  setMediaUrl(url);
                  setStatus(isImage ? "Image loaded via P2P" : "Ready to play");

                  // --- SAVE LOGIC ---
                  // If we have a good download, save it for next time
                  // Only save videos if we are near completion to avoid saving broken files
                  if (isVideo && percent > 95) {
                    saveBlobToCache(url, `${cid}.mp4`);
                  }
                }
              });
            }
          }
        });

        // Also save on completion to be safe
        torrent.on("done", () => {
          console.log("✅ Torrent done, ensuring cache save...");
          if (isVideo && torrent.files[0]) {
            torrent.files[0].getBlobURL((err, url) => {
              if (!err) saveBlobToCache(url, `${cid}.mp4`);
            });
          }
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, using IPFS");
          if (cid) setMediaUrl(ipfsUrl);
        });

        const timeoutDuration = isVideo ? 10000 : 25000;

        setTimeout(
          () => {
            if (!mediaUrl && cid) {
              setStatus("P2P timeout, using IPFS");
              setMediaUrl(ipfsUrl);
            }
          },
          isFocused ? timeoutDuration : timeoutDuration * 3
        );
      } catch (error) {
        console.error("Error loading media:", error);
        setStatus("Error, using IPFS fallback");
        if (cid) setMediaUrl(ipfsUrl);
      }
    };

    loadMedia();

    return () => {
      // Cleanup
    };
  }, [magnetLink, cid, isFocused, isImage, strategy]);

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
            cachePolicy={"memory-disk"}
            source={{ uri: ipfsUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <Text style={styles.status}>Native Video Player Placeholder</Text>
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
              cachePolicy={"memory-disk"}
              source={{ uri: mediaUrl }}
              style={styles.image}
              resizeMode="contain"
              onLoad={() => console.log("✅ Image loaded")}
              onError={() => {
                setStatus("Image load failed");
                if (cid) setMediaUrl(ipfsUrl);
              }}
            />
          ) : (
            <>
              <video
                ref={videoRef}
                src={mediaUrl}
                controls
                style={styles.video}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={handleVideoEnd}
                onError={() => {
                  setStatus("Video load failed");
                  if (cid) setMediaUrl(ipfsUrl);
                }}
              />

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
                  <Text style={styles.peerText}>
                    {isCachedLocally ? "Local File" : `${peers} peers`}
                  </Text>
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
          {progress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      )}

      <View style={styles.mediaInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName || (isImage ? "Image" : "Video")}
        </Text>
        {magnetLink && (
          <Text style={styles.magnetHint}>
            🔗 P2P {isImage ? "Image" : "Video"}
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
    marginBottom: 1,
    width: "100%",
    alignSelf: "flex-start",
  },
  mediaWrapper: {
    position: "relative",
  },
  image: {
    width: "200",
    height: 200,
    minHeight: 300,
  },
  video: {
    width: "100%",
    height: undefined,
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
    color: "#aaa",
  },
  loadingContainer: {
    backgroundColor: "#111",
    padding: 20,
    alignItems: "center",
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
    opacity: 0,
  },
  magnetHint: {
    color: "#00ffff",
    fontSize: 12,
    marginTop: 4,
  },
});
