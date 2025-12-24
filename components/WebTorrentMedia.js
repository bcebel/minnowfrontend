// WebTorrentMedia.js - Final Version
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


// Import the SSR-safe mediaCache
let mediaCache;
if (Platform.OS === "web" && typeof window !== "undefined") {
  // Only load the real IndexedDB cache in a real browser
  try {
    mediaCache = require("./mediaCache").mediaCache;
  } catch (error) {
    console.warn("Media cache failed to load:", error.message);
    // Fallback mock for web if module fails
    mediaCache = {
      getMedia: async () => null,
      saveMedia: async () => {},
      hasMedia: async () => false,
    };
  }
} else {
  // Native or server-side: use mock
  mediaCache = {
    getMedia: async () => null,
    saveMedia: async () => {},
    hasMedia: async () => false,
  };
}

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const CACHE_FOLDER = "file:///cache/webtorrent_media/";

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

const getMediaType = (media) => {
  const fileName = media.fileName || "";
  const url = media.imageUrl || media.videoUrl || "";

  if (
    fileName.match(/\.(mp4|mov|webm|avi|mkv)$/i) ||
    url.match(/\.(mp4|mov|webm|avi|mkv)$/i)
  ) {
    return "video";
  }

  if (
    fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ||
    url.match(/\.(jpg|jpeg|png|gif|webp)$/i)
  ) {
    return "image";
  }

  return "unknown";
};

export default function WebTorrentMedia({ media, isFocused }) {
  const debugLog = (stage, data = {}) => {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`[${timestamp}] WebTorrentMedia [${cid?.slice(0, 8)}...] ${stage}`, {
    ...data,
    hasMagnet: !!magnetLink,
    hasClient: !!window.globalWebTorrentClient,
    platform: Platform.OS
  });
};
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

  
  const mediaType = getMediaType(media);

  const { loading, error, data } = useQuery(
    mediaType === "video" ? GET_VIDEO : GET_IMAGE,
    {
      variables: {
        [mediaType === "video" ? "videoId" : "imageId"]: cid,
      },
      skip: !cid,
    }
  );

  // State
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCachedLocally, setIsCachedLocally] = useState(false);
  const [blobUrl, setBlobUrl] = useState(null);

  const videoRef = useRef(null);
  const torrentRef = useRef(null);

  // Get media data
  const mediaData = data?.[mediaType] || media;
  const { magnetLink, fileName, fileType, isPublic } = mediaData;
  const isImage = fileType === "image" || mediaType === "image";
  const isVideo = fileType === "video" || mediaType === "video";
  const ipfsUrl = cid ? `https://${PINATA_GATEWAY}/ipfs/${cid}` : null;

  const getStrategy = (fileType) => {
    if (fileType === "video") return "sequential";
    if (fileType === "image") return "rarest";
    return "rarest";
  };

  // Cleanup blob URLs
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  // Status updates
  useEffect(() => {
    if (loading) {
      setStatus("Fetching metadata...");
    } else if (error) {
      setStatus("Metadata failed - using fallback");
    } else if (data) {
      setStatus("Metadata loaded");
    }
  }, [loading, error, data]);

  // ==================== NATIVE CACHE FUNCTIONS ====================
  const getNativeCacheUri = (cid, fileName, isImage) => {
    const extension = isImage ? fileName?.split(".").pop() || "jpg" : "mp4";
    return `${CACHE_FOLDER}${cid}.${extension}`;
  };

  const checkNativeCache = async () => {
    if (!cid || Platform.OS === "web") return null;

    try {
      const cacheUri = getNativeCacheUri(cid, fileName, isImage);
      const file = new File(cacheUri);
      const info = await file.info();

      if (info.exists) {
        return cacheUri;
      }
    } catch (err) {
      console.warn("Native cache check failed:", err);
    }
    return null;
  };

  const saveToNativeCache = async (cid, blobData, isImage) => {
    if (Platform.OS === "web") return;

    try {
      // Create cache directory if it doesn't exist
      const cacheDir = new Directory(CACHE_FOLDER);
      const dirInfo = await cacheDir.info();

      if (!dirInfo.exists) {
        await cacheDir.makeAsync();
      }

      // Save file
      const cacheUri = getNativeCacheUri(cid, fileName, isImage);
      const file = new File(cacheUri);

      // Convert blob to base64 for saving
      const base64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(blobData);
      });

      await file.writeAsStringAsync(base64.split(",")[1], {
        encoding: "base64",
      });

      console.log(`✅ Saved to native cache: ${cid}`);
    } catch (error) {
      console.warn("Failed to save to native cache:", error);
    }
  };

  // ==================== NATIVE LOADING FUNCTION ====================
  const loadMediaNative = async () => {
    if (!cid) return;

    // 1. Check CID-based file cache FIRST
    const cachedUri = await checkNativeCache();
    if (cachedUri) {
      setMediaUrl(cachedUri);
      setStatus("Ready (Local Cache)");
      setIsCachedLocally(true);
      return;
    }

    // 2. If not cached, fetch from your source chain
    let fetchedBlob;
    try {
      // Try your REST API first
      setStatus("Fetching from REST API...");
      const response = await fetch(`/api/media/${cid}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      fetchedBlob = await response.blob();
    } catch (apiError) {
      // Fallback to IPFS gateway
      console.log("REST API failed, trying IPFS gateway...", apiError);
      setStatus("Fetching from IPFS...");
      const ipfsResponse = await fetch(ipfsUrl);
      if (!ipfsResponse.ok) throw new Error("IPFS gateway failed");
      fetchedBlob = await ipfsResponse.blob();
    }

    // 3. Save the fetched blob using your CID-based path
    await saveToNativeCache(cid, fetchedBlob, isImage);

    // 4. Update state to display from the new cached file URI
    const newCacheUri = getNativeCacheUri(cid, fileName, isImage);
    setMediaUrl(newCacheUri);
    setStatus("Loaded and Cached");
    setIsCachedLocally(true);
  };

  // ==================== WEB CACHE FUNCTIONS ====================
  const loadMediaWeb = async () => {
    if (!cid) return;

    // 1. Check IndexedDB cache
    const cached = await mediaCache.getMedia(cid);
    if (cached) {
      const newBlobUrl = URL.createObjectURL(cached.blob);
      setBlobUrl(newBlobUrl);
      setMediaUrl(newBlobUrl);
      setStatus("Ready (Local Cache)");
      setIsCachedLocally(true);
      return;
    }

    // 2. Check browser cache via expo-image for images
    if (isImage && ipfsUrl) {
      setMediaUrl(ipfsUrl);
      setStatus("Checking browser cache...");
    }

    // 3. Try P2P
    try {
      const client = window.globalWebTorrentClient;
      if (client && magnetLink) {
        await loadViaWebTorrent();
        return;
      }
    } catch (error) {
      console.error("WebTorrent failed:", error);
    }

    // 4. Fallback to REST API
    await loadFromRestAPI();
  };

const loadViaWebTorrent = async () => {
  debugLog("START WebTorrent load", { strategy, fileType });

  // Track if we've already resolved/rejected
  let hasResolved = false;

  const client = window.globalWebTorrentClient;
  const strategy = getStrategy(fileType);
  setStatus(`Connecting to P2P swarm (${strategy} mode)...`);

  // Create a clean promise with multiple timeout strategies
  return new Promise((resolve, reject) => {
    // STRATEGY 1: Absolute timeout - ALWAYS resolves after 45 seconds max
    const absoluteTimeout = setTimeout(() => {
      if (!hasResolved) {
        debugLog("ABSOLUTE TIMEOUT - Forcing fallback after 45s", {
          elapsed: "45s",
          reason: "Maximum time exceeded",
        });
        hasResolved = true;
        setStatus("Timeout, trying REST API...");
        resolve();
      }
    }, 45000);

    // Quick exit if no client or magnet
    if (!client || !magnetLink) {
      debugLog("NO CLIENT/MAGNET - Skipping WebTorrent");
      clearTimeout(absoluteTimeout);
      hasResolved = true;
      resolve();
      return;
    }

    let torrent = client.get(magnetLink);
    if (!torrent) {
      debugLog("Adding new torrent", {
        magnetLink: magnetLink.substring(0, 50) + "...",
      });
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
    } else {
      debugLog("Reusing existing torrent", {
        name: torrent.name,
        progress: torrent.progress,
        peers: torrent.numPeers,
      });
    }

    torrentRef.current = torrent;
    if (cid) torrent.addWebSeed(ipfsUrl);

    // Progress tracking for "stuck" detection
    let lastProgress = 0;
    let lastProgressTime = Date.now();
    let consecutiveStuckChecks = 0;

    // Track download speed
    let lastDownloaded = 0;
    let lastSpeedCheck = Date.now();

    // STRATEGY 2: Stuck progress detection
    const progressStuckCheck = setInterval(() => {
      if (!torrent || hasResolved) {
        clearInterval(progressStuckCheck);
        return;
      }

      const currentProgress = torrent.progress * 100;
      const currentTime = Date.now();
      const timeSinceLastProgress = currentTime - lastProgressTime;

      debugLog("Progress health check", {
        currentProgress: currentProgress.toFixed(2) + "%",
        lastProgress: lastProgress.toFixed(2) + "%",
        timeSinceLastProgress: Math.round(timeSinceLastProgress / 1000) + "s",
        peers: torrent.numPeers,
        downloadSpeed: torrent.downloadSpeed
          ? (torrent.downloadSpeed / 1024).toFixed(1) + "KB/s"
          : "0 KB/s",
      });

      // Calculate download speed
      const downloadedDelta = torrent.downloaded - lastDownloaded;
      const timeDelta = currentTime - lastSpeedCheck;
      const downloadSpeed =
        timeDelta > 0 ? downloadedDelta / (timeDelta / 1000) : 0; // bytes per second

      // Update trackers
      if (currentProgress > lastProgress) {
        lastProgress = currentProgress;
        lastProgressTime = currentTime;
        consecutiveStuckChecks = 0; // Reset stuck counter on progress
      } else {
        consecutiveStuckChecks++;
      }

      lastDownloaded = torrent.downloaded;
      lastSpeedCheck = currentTime;

      // Check if progress is TOO SLOW (not just zero)
      const loadThreshold = isVideo ? 5 : 2;
      const minimumAcceptableSpeed = 1024; // 1 KB/s minimum

      // Conditions for being "stuck":
      // 1. Has peers but speed is too slow
      const hasPeersButNoSpeed =
        torrent.numPeers > 0 && downloadSpeed < minimumAcceptableSpeed;

      // 2. No progress for 15+ seconds but still has peers
      const noProgressForTooLong =
        timeSinceLastProgress > 15000 && torrent.numPeers > 0;

      // 3. Very slow progress rate (would take >5 minutes to reach threshold)
      if (downloadSpeed > 0 && currentProgress < loadThreshold) {
        const bytesNeeded =
          torrent.length * (loadThreshold / 100) - torrent.downloaded;
        const secondsToThreshold = bytesNeeded / downloadSpeed;

        if (secondsToThreshold > 300) {
          // Would take >5 minutes
          debugLog("PROGRESS TOO SLOW - Aborting", {
            currentSpeed: (downloadSpeed / 1024).toFixed(2) + "KB/s",
            estimatedTime: Math.round(secondsToThreshold / 60) + " minutes",
            progressNeeded: loadThreshold + "%",
          });
          clearInterval(progressStuckCheck);
          clearTimeout(absoluteTimeout);
          hasResolved = true;
          torrent.destroy({ destroyStore: true });
          setStatus("Download too slow, trying REST API...");
          resolve();
          return;
        }
      }

      if (hasPeersButNoSpeed || noProgressForTooLong) {
        consecutiveStuckChecks++;

        if (consecutiveStuckChecks >= 3) {
          // 3 consecutive checks = ~15 seconds
          debugLog("STUCK DETECTED - Aborting WebTorrent", {
            reason: hasPeersButNoSpeed
              ? "Low speed with peers"
              : "No progress with peers",
            peers: torrent.numPeers,
            speed: (downloadSpeed / 1024).toFixed(1) + "KB/s",
            timeStuck: Math.round(timeSinceLastProgress / 1000) + "s",
          });
          clearInterval(progressStuckCheck);
          clearTimeout(absoluteTimeout);
          hasResolved = true;
          torrent.destroy({ destroyStore: true });
          setStatus("Stuck in P2P, trying REST API...");
          resolve();
        }
      } else {
        consecutiveStuckChecks = 0; // Reset if making progress
      }
    }, 5000);

    const startTime = Date.now();

    torrent.on("download", () => {
      if (hasResolved) return;

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
            if (hasResolved) return;

            if (!err && blob) {
              debugLog("Torrent success - got blob", {
                size: blob.size,
                type: blob.type,
                timeElapsed: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
              });

              // Save to IndexedDB
              mediaCache.saveMedia(cid, blob, blob.type, fileName);

              const newBlobUrl = URL.createObjectURL(blob);
              setBlobUrl(newBlobUrl);
              setMediaUrl(newBlobUrl);
              setStatus(isImage ? "Image loaded via P2P" : "Ready to play");

              clearInterval(progressStuckCheck);
              clearTimeout(absoluteTimeout);
              hasResolved = true;
              resolve();
            } else if (err) {
              debugLog("Torrent blob error", { error: err.message });
              // Continue - don't reject, let fallback handle it
            }
          });
        }
      }
    });

    torrent.on("error", (err) => {
      if (hasResolved) return;

      debugLog("Torrent error event", { error: err.message });
      clearInterval(progressStuckCheck);
      clearTimeout(absoluteTimeout);
      hasResolved = true;

      setStatus("P2P failed, trying REST API...");
      resolve();
    });

    // Add 'no peer' detection
    torrent.on("warning", (warning) => {
      debugLog("Torrent warning", { warning: warning.toString() });
      if (
        warning.toString().includes("no peers") ||
        warning.toString().includes("tracker")
      ) {
        setStatus("Finding peers...");
      }
    });

    // STRATEGY 3: If no peers after 10 seconds, give up
    setTimeout(() => {
      if (!hasResolved && torrent && torrent.numPeers === 0) {
        debugLog("NO PEERS TIMEOUT - Aborting after 10s", {
          timeElapsed: "10s",
          progress: (torrent.progress * 100).toFixed(2) + "%",
        });
        clearInterval(progressStuckCheck);
        clearTimeout(absoluteTimeout);
        hasResolved = true;
        torrent.destroy({ destroyStore: true });
        setStatus("No peers found, trying REST API...");
        resolve();
      }
    }, 10000);
  });
};

  const loadFromRestAPI = async () => {
    if (!cid) return;

    setStatus("Loading from REST API...");
    try {
      const response = await fetch(`/api/media/${cid}`);
      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const blob = await response.blob();

      // Save to appropriate cache
      if (Platform.OS === "web") {
        await mediaCache.saveMedia(cid, blob, blob.type, fileName);
      } else {
        await saveToNativeCache(cid, blob, isImage);
      }

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

  // ==================== MAIN LOADING EFFECT ====================
useEffect(() => {
  if (!mediaData || !cid) return;

  let isActive = true;

  const loadMedia = async () => {
    if (!isActive) return;

    debugLog("START media load sequence");

    if (Platform.OS === "web") {
      // Try WebTorrent with timeout protection
      try {
        await Promise.race([
          loadMediaWeb(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Overall load timeout")), 45000)
          ),
        ]);
      } catch (error) {
        debugLog("Load sequence failed", { error: error.message });
        if (isActive && ipfsUrl) {
          setStatus("Using IPFS fallback");
          setMediaUrl(ipfsUrl);
        }
      }
    } else {
      await loadMediaNative();
    }

    if (isActive) {
      debugLog("END media load sequence");
    }
  };

  loadMedia();

  return () => {
    isActive = false;
    debugLog("CLEANUP - component unmounting");

    if (torrentRef.current) {
      debugLog("Destroying torrent", { name: torrentRef.current.name });
      // Only destroy if we're the only one using it
      torrentRef.current.destroy({ destroyStore: true });
    }
  };
}, [mediaData, isFocused, cid]);

  // ==================== RENDER ====================
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

  const strategy = getStrategy(fileType);

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
            source={{ uri: mediaUrl || ipfsUrl }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.videoContainer}>
            <Text style={styles.status}>
              {mediaUrl ? "Playing native video" : "Loading..."}
            </Text>
          </View>
        )}
        <View style={styles.mediaInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName || (isImage ? "Image" : "Video")}
          </Text>
          <Text
            style={[
              styles.publicLabel,
              isPublic ? styles.public : styles.private,
            ]}
          >
            {isPublic ? "PUBLIC" : "PRIVATE"}
          </Text>
        </View>
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
                    {isCachedLocally ? "Local Cache" : `${peers} peers`}
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
        <Text
          style={[
            styles.publicLabel,
            isPublic ? styles.public : styles.private,
          ]}
        >
          {isPublic ? "PUBLIC" : "PRIVATE"}
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
