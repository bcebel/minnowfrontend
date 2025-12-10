import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system";
import { useAuth } from "../contexts/AuthContext"; // Assuming you have auth context

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const CACHE_FOLDER = `${FileSystem.cacheDirectory}webtorrent_media/`;

export default function WebTorrentMedia({ media, isFocused }) {
  const { userToken, isAuthenticated } = useAuth(); // Get auth state
  const [mediaData, setMediaData] = useState(null); // Store fetched metadata
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Loading metadata...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCachedLocally, setIsCachedLocally] = useState(false);

  const videoRef = useRef(null);
  const torrentRef = useRef(null);

  // Extract CID first (needed for API call)
  const cid = (() => {
    if (media.cid) return media.cid;
    if (media.fileName) {
      const cidFromFileName = media.fileName.split(".")[0];
      if (cidFromFileName.startsWith("Qm") || cidFromFileName.startsWith("baf")) {
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
  })();

  // ------------------------------------------------------------
  // EFFECT 1: FETCH MEDIA METADATA FROM API
  // ------------------------------------------------------------
  useEffect(() => {
    if (!cid) {
      setStatus("No CID available");
      return;
    }

    const fetchMediaMetadata = async () => {
      try {
        setStatus("Fetching metadata...");
        
        // Use the smart endpoint that auto-detects public/private
        const response = await fetch(`/api/media/${cid}`, {
          headers: isAuthenticated && userToken 
            ? { 'Authorization': `Bearer ${userToken}` }
            : {}
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setMediaData(data);
        setStatus("Metadata loaded");
        
      } catch (error) {
        console.error("Failed to fetch media metadata:", error);
        setStatus("Metadata failed - using fallback");
        
        // Fallback to local media prop if API fails
        setMediaData({
          fileName: media.fileName,
          fileType: media.fileType,
          cid: cid,
          magnetLink: media.magnetLink,
          isPublic: media.isPublic || false // Default to private for safety
        });
      }
    };

    fetchMediaMetadata();
  }, [cid, isAuthenticated, userToken]); // ✅ Only depends on auth and CID

  // ------------------------------------------------------------
  // EFFECT 2: LOAD MEDIA (WebTorrent/Cache) - DEPENDS ON mediaData
  // ------------------------------------------------------------
  useEffect(() => {
    if (!mediaData) return; // Wait until we have metadata
    
    const { magnetLink, fileName, fileType, isPublic } = mediaData;
    const isImage = fileType === "image";
    const isVideo = fileType === "video";
    const ipfsUrl = `https://${PINATA_GATEWAY}/ipfs/${cid}`;

    // NATIVE PLATFORM
    if (Platform.OS !== "web") {
      if (cid) {
        setMediaUrl(ipfsUrl);
        setStatus("Loaded via IPFS");
      }
      return;
    }

    // WEB PLATFORM - P2P Logic
    const loadMedia = async () => {
      // --- CACHE CHECK ---
      try {
        if (isImage) {
          const cachedPath = await Image.getCachePathAsync(ipfsUrl);
          if (cachedPath) {
            setMediaUrl(ipfsUrl);
            setStatus("Ready (Cached)");
            setIsCachedLocally(true);
            return;
          }
        } else if (isVideo) {
          const cacheFilename = `${cid}.mp4`;
          const localUri = CACHE_FOLDER + cacheFilename;
          const fileInfo = await FileSystem.getInfoAsync(localUri);
          if (fileInfo.exists) {
            setMediaUrl(localUri);
            setStatus("Ready (Local Cache)");
            setIsCachedLocally(true);
            return;
          }
        }
      } catch (err) {
        console.warn("Cache check skipped:", err);
      }

      // --- P2P LOADING ---
      try {
        const client = window.globalWebTorrentClient;

        // If no magnet link, use direct IPFS
        if (!magnetLink || !cid) {
          console.log("📁 No magnet link, using direct IPFS");
          if (cid) setMediaUrl(ipfsUrl);
          setStatus("Loaded via IPFS");
          return;
        }

        if (!client) throw new Error("Global WebTorrent client not found");

        // Get optimal strategy
        const getOptimalStrategy = () => {
          if (fileType === "video") return "sequential";
          if (fileType === "image") return "rarest";
          return "rarest";
        };
        const strategy = getOptimalStrategy();

        setStatus(`Connecting to P2P swarm (${strategy} mode)...`);

        // Existing WebTorrent logic...
        let torrent = client.get(magnetLink);
        if (!torrent) {
          torrent = client.add(magnetLink, {
            strategy: strategy,
            ...(isVideo ? {
              storeCacheSlots: 20,
              preloadStoreSize: 10 * 1024 * 1024,
              destroyStoreOnDestroy: false,
            } : {
              storeCacheSlots: 5,
              preloadStoreSize: 2 * 1024 * 1024,
            }),
          });
        }

        torrentRef.current = torrent;
        if (cid) torrent.addWebSeed(ipfsUrl);

        // Event handlers...
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
                }
              });
            }
          }
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, using IPFS");
          if (cid) setMediaUrl(ipfsUrl);
        });

        // Timeout fallback
        setTimeout(() => {
          if (!mediaUrl && cid) {
            setStatus("P2P timeout, using IPFS");
            setMediaUrl(ipfsUrl);
          }
        }, isVideo ? 10000 : 25000);

      } catch (error) {
        console.error("Error loading media:", error);
        setStatus("Error, using IPFS fallback");
        if (cid) setMediaUrl(ipfsUrl);
      }
    };

    loadMedia();

    return () => {
      // Cleanup
      console.log("Cleaning up torrent");
    };
  }, [mediaData, isFocused, cid]); // ✅ Depends on mediaData (fetched from API)

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

   const { fileName, fileType } = mediaData || media;
  const isImage = fileType === "image";
  const isVideo = fileType === "video";

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
