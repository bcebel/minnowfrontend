// WebTorrentMedia.js
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { Image } from "expo-image";
import { File, Directory } from "expo-file-system";
import { useQuery, gql } from "@apollo/client";

// Import IndexedDB cache for web
import { mediaCache } from "./mediaCache"; // Assuming you create this file

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const CACHE_FOLDER = `${FileSystem.cacheDirectory}webtorrent_media/`;

// GraphQL Queries
const GET_VIDEO = gql`
  query GetVideo($videoId: ID!) {
    video(id: $videoId) {
      cid
      isPublic
      fileType
      fileName
      magnetLink
    }
  }
`;

const GET_IMAGE = gql`
  query GetImage($imageId: ID!) {
    image(id: $imageId) {
      cid
      isPublic
      fileType
      fileName
      magnetLink
    }
  }
`;

// Helper function to determine media type from fileName or URL
const getMediaType = (media) => {
  const fileName = media.fileName || "";
  const url = media.imageUrl || media.videoUrl || "";

  // Check video extensions
  if (
    fileName.match(/\.(mp4|mov|webm|avi|mkv)$/i) ||
    url.match(/\.(mp4|mov|webm|avi|mkv)$/i)
  ) {
    return "video";
  }

  // Check image extensions
  if (
    fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
    url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
  ) {
    return "image";
  }

  return "unknown";
};

// Helper function to ensure cache directory exists (Native only)
const ensureCacheDir = async () => {
  if (Platform.OS === "web") return true;

  try {
    const cacheDir = new Directory(CACHE_FOLDER);
    const dirInfo = await cacheDir.info();
    if (!dirInfo.exists) {
      await cacheDir.makeAsync();
      console.log("Created cache directory:", CACHE_FOLDER);
    }
    return true;
  } catch (error) {
    console.error("Failed to ensure cache directory:", error);
    return false;
  }
};

export default function WebTorrentMedia({ media, isFocused }) {
  // Extract CID
  const cid = (() => {
    if (media.cid) return media.cid;
    if (media.fileName) {
      const cidFromFileName = media.fileName.split(".")[0];
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
  })();

  // Determine media type for GraphQL query
  const mediaType = getMediaType(media);
  
  // GraphQL query for metadata
  const { loading, error, data } = useQuery(
    mediaType === "video" ? GET_VIDEO : GET_IMAGE,
    {
      variables: {
        [mediaType === "video" ? "videoId" : "imageId"]: cid,
      },
      skip: !cid,
      onError: (err) => {
        console.log("GraphQL error (non-critical):", err.message);
      },
    }
  );

  // State
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCachedLocally, setIsCachedLocally] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null); // For web blob URLs

  const videoRef = useRef(null);
  const torrentRef = useRef(null);

  // Get media data from GraphQL or fallback to props
  const mediaData = data?.[mediaType] || media;
  const { magnetLink, fileName, fileType, isPublic } = mediaData;
  const isImage = fileType === "image" || mediaType === "image";
  const isVideo = fileType === "video" || mediaType === "video";
  const ipfsUrl = cid ? `https://${PINATA_GATEWAY}/ipfs/${cid}` : null;

  // Strategy helper
  const getStrategy = (fileType) => {
    if (fileType === "video") return "sequential";
    if (fileType === "image") return "rarest";
    return "rarest";
  };

  // Cleanup function for blob URLs (Web only)
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Update status based on GraphQL query state
  useEffect(() => {
    if (loading) {
      setStatus("Fetching metadata...");
    } else if (error) {
      setStatus("Metadata failed - using fallback");
    } else if (data) {
      setStatus("Metadata loaded");
    }
  }, [loading, error, data]);

  // ============================================
  // WEB-SPECIFIC LOADING FUNCTION
  // ============================================
  const loadMediaWeb = async () => {
    if (!mediaData || !cid) return;

    // 1. CHECK INDEXEDDB CACHE (FASTEST PATH)
    const cached = await mediaCache.getMedia(cid);
    if (cached) {
      const newBlobUrl = URL.createObjectURL(cached.blob);
      setBlobUrl(newBlobUrl);
      setMediaUrl(newBlobUrl);
      setStatus("Ready (Local Cache)");
      setIsCachedLocally(true);
      return;
    }

    // 2. CHECK BROWSER CACHE (via expo-image for images only)
    if (isImage && ipfsUrl) {
      // expo-image handles its own browser cache
      setMediaUrl(ipfsUrl);
      setStatus("Checking browser cache...");
      // Continue to P2P in background
    }

    // 3. ATTEMPT P2P (WEBTORRENT)
    try {
      const client = window.globalWebTorrentClient;

      if (client && magnetLink) {
        const strategy = getStrategy(fileType);
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
        if (cid) torrent.addWebSeed(ipfsUrl);

        // Event handlers
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
              file.getBlob((err, blob) => {
                if (!err && blob) {
                  // Store in IndexedDB for future
                  mediaCache.saveMedia(cid, blob, blob.type, fileName || `media_${cid.substring(0, 8)}`);
                  
                  const newBlobUrl = URL.createObjectURL(blob);
                  setBlobUrl(newBlobUrl);
                  setMediaUrl(newBlobUrl);
                  setStatus(isImage ? "Image loaded via P2P" : "Ready to play");
                }
              });
            }
          }
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, trying REST API...");
          // Fall through to REST API
        });

        // Timeout fallback
        setTimeout(() => {
          if (!mediaUrl && cid) {
            setStatus("P2P timeout, trying REST API...");
            loadFromRestAPI();
          }
        }, isVideo ? 10000 : 25000);

        return;
      }
    } catch (torrentError) {
      console.error("WebTorrent initialization error:", torrentError);
    }

    // 4. FALLBACK TO REST API (YOUR BACKUP)
    loadFromRestAPI();
  };

  // REST API fallback function for web
  const loadFromRestAPI = async () => {
    if (!cid) return;
    
    setStatus("Loading from REST API...");
    try {
      // Replace with your actual REST API endpoint
      const response = await fetch(`/api/media/${cid}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      
      const blob = await response.blob();
      
      // Store in IndexedDB
      await mediaCache.saveMedia(
        cid, 
        blob, 
        blob.type, 
        fileName || `media_${cid.substring(0, 8)}`
      );
      
      const newBlobUrl = URL.createObjectURL(blob);
      setBlobUrl(newBlobUrl);
      setMediaUrl(newBlobUrl);
      setStatus("Loaded via REST API");
    } catch (apiError) {
      console.error("REST API failed:", apiError);
      setStatus("All sources failed, using IPFS gateway");
      if (ipfsUrl) {
        setMediaUrl(ipfsUrl);
      }
    }
  };

  // ============================================
  // NATIVE LOADING FUNCTION
  // ============================================
  const loadMediaNative = async () => {
    if (!mediaData || !cid) return;

    await ensureCacheDir();

    // Check local filesystem cache
    try {
      const extension = isImage ? (fileName?.split('.').pop() || 'jpg') : 'mp4';
      const cacheFilename = `${cid}.${extension}`;
      const localUri = CACHE_FOLDER + cacheFilename;
      
      const file = new File(localUri);
      const info = await file.info();
      
      if (info.exists) {
        setMediaUrl(localUri);
        setStatus("Ready (Local Cache)");
        setIsCachedLocally(true);
        return;
      }
    } catch (err) {
      console.warn("Cache check skipped:", err);
    }

    // If no cache, use IPFS URL
    if (ipfsUrl) {
      setMediaUrl(ipfsUrl);
      setStatus("Loaded via IPFS");
    }
  };

  // ============================================
  // MAIN LOADING EFFECT
  // ============================================
  useEffect(() => {
    if (!mediaData || !cid) return;

    if (Platform.OS === "web") {
      loadMediaWeb();
    } else {
      loadMediaNative();
    }

    // Cleanup function
    return () => {
      if (torrentRef.current) {
        console.log("Cleaning up torrent");
        // Optional: Remove torrent if no longer needed
        // torrentRef.current.destroy();
      }
    };
  }, [mediaData, isFocused, cid]);

  // ============================================
  // VIDEO CONTROLS
  // ============================================
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

  // ============================================
  // LOADING/ERROR STATES
  // ============================================
  if (loading && !mediaData) {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>Loading metadata...</Text>
      </View>
    );
  }

  if (error && !mediaData) {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>Failed to load metadata</Text>
      </View>
    );
  }

  // ============================================
  // RENDER
  // ============================================
  
  // For native, use simple IPFS loading
  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        {isImage && ipfsUrl ? (
          <Image
            cachePolicy={"memory-disk"}
            source={{ uri: ipfsUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : isVideo ? (
          <View style={styles.videoContainer}>
            <Text style={styles.status}>Native video: {ipfsUrl}</Text>
            {/* For native video, you'd use a video player component here */}
          </View>
        ) : (
          <Text style={styles.status}>Unsupported media type</Text>
        )}
        <View style={styles.mediaInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || (isImage ? "Image" : "Video")}
          </Text>
          <Text style={[styles.publicLabel, isPublic ? styles.public : styles.private]}>
            {isPublic ? 'PUBLIC' : 'PRIVATE'}
          </Text>
        </View>
      </View>
    );
  }

  // Web rendering
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
          ) : isVideo ? (
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
                    {isCachedLocally ? "Local Cache" : `${peers} peers`}
                  </Text>
                  <Text style={styles.strategyText}>
                    {getStrategy(fileType) === "sequential" ? "🎬 Stream" : "⚡ Quick Load"}
                  </Text>
                </View>
              </View>
            </>
          ) : null}
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
        <Text style={[styles.publicLabel, isPublic ? styles.public : styles.private]}>
          {isPublic ? 'PUBLIC' : 'PRIVATE'}
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
  videoContainer: {
    minHeight: 300,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
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
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 4,
  },
  magnetHint: {
    color: "#00ffff",
    fontSize: 12,
    marginTop: 4,
  },
  publicLabel: {
    fontSize: 10,
    fontWeight: "bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    overflow: "hidden",
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  public: {
    backgroundColor: "#4CAF50",
    color: "white",
  },
  private: {
    backgroundColor: "#F44336",
    color: "white",
  },
});
