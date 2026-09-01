 // WebTorrentMedia.js - ULTIMATE FALLBACK VERSION
import React, { useState, useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getMedia, saveMedia } from "../components/mediaCache";
import webtorrentService from "../utils/webtorrentService";

const PINATA_GATEWAY =
  process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

// Move cache OUTSIDE the component
const pinataCache = new Map();

if (typeof window !== "undefined") {
  window.__pinataCache = pinataCache;
}

const getCachedPinataUrl = (cid, fallbackUrl) => {
  if (pinataCache.has(cid)) {
    console.log(`💾 Pinata cache hit: ${cid}`);
    return pinataCache.get(cid);
  }

  const url = fallbackUrl || `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  pinataCache.set(cid, url);
  console.log(`💾 Pinata cached: ${cid}`);
  return url;
};

export default function WebTorrentMedia({ media, isFocused }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [status, setStatus] = useState("initializing");
  const [progress, setProgress] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [isReady, setIsReady] = useState(false);

  const videoRef = useRef(null);
  const currentUrlRef = useRef(null);
  const isMountedRef = useRef(true);
  const p2pHitRef = useRef(false);

  // ✅ NEW REFS FOR THE HARD CUTOFFS
  const overallTimeoutRef = useRef(null); // 15s absolute cutoff
  const noProgressTimeoutRef = useRef(null); // 5s zero-progress cutoff

  useEffect(() => {
    // ✅ CRITICAL: If NOT focused, don't even start the download.
    if (!isFocused) {
      return; 
    }

    isMountedRef.current = true;
    p2pHitRef.current = false;

    let activeTorrent = null;

    const fallbackUrl = media.ipfsUrl || media.fallbackUrl;

    const loadMedia = async () => {
      // 1. Check local device cache (fastest)
      try {
        setStatus("checking_cache");
        const cachedData = await getMedia(media.cid);

        if (cachedData?.blob && isMountedRef.current) {
          const url = URL.createObjectURL(cachedData.blob);
          currentUrlRef.current = url;
          setVideoSrc(url);
          setStatus("cached");
          setProgress(100);
          setIsReady(true);
          return;
        }
      } catch (err) {
        console.log("Cache miss:", err.message);
      }

      // 2. Check if this is a multi-slice video
      if (media.slices && media.slices.length > 1) {
        try {
          setStatus("connecting_slices");
          console.log(`📦 Loading ${media.slices.length} slices...`);

          const chunks = [];
          for (const slice of media.slices) {
            if (!isMountedRef.current) return;

            const result = await webtorrentService.add(slice.magnetLink);
            const response = await fetch(result.url);
            const blob = await response.blob();
            chunks.push(blob);
          }

          const combined = new Blob(chunks, { type: "video/mp4" });
          const url = URL.createObjectURL(combined);
          currentUrlRef.current = url;
          setVideoSrc(url);
          setStatus("p2p_streaming");
          setProgress(100);
          setIsReady(true);
          return;
        } catch (err) {
          console.log("Slice assembly failed:", err.message);
        }
      }

      // 3. GIVE P2P A CHANCE, BUT WITH HARD TIMEOUTS!
      if (media?.magnetLink) {
        try {
          if (isMountedRef.current) setStatus("connecting_p2p");

          // 🛑 SET THE 15-SECOND ABSOLUTE CUTOFF
          overallTimeoutRef.current = setTimeout(() => {
            if (!isReady && isMountedRef.current) {
              console.log("⏰ 15s overall timeout. Forcing HTTP.");
              const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
              setVideoSrc(cachedUrl);
              setStatus("fallback_http");
              setIsReady(true);
              // Clear the other timer
              if (noProgressTimeoutRef.current) clearTimeout(noProgressTimeoutRef.current);
            }
          }, 15000);

          // 🛑 SET THE 5-SECOND NO-PROGRESS CUTOFF
          noProgressTimeoutRef.current = setTimeout(() => {
            if (!isReady && progress === 0 && isMountedRef.current) {
              console.log("🐌 No progress in 5s. Forcing HTTP.");
              const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
              setVideoSrc(cachedUrl);
              setStatus("fallback_http");
              setIsReady(true);
              // Clear the overall timer
              if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current);
            }
          }, 5000);

          // Start the torrent
          const torrentResult = await webtorrentService.add(media.magnetLink, {
            urlList: fallbackUrl ? [fallbackUrl] : [],
            strategy: "sequential",
            maxWebConns: 4,
          });

          if (!isMountedRef.current) return;

          activeTorrent = torrentResult.torrent;

          if (activeTorrent) {
            const updateStats = () => {
              if (!isMountedRef.current) return;
              const numPeers = activeTorrent.numPeers || 0;
              const pct = Math.floor(activeTorrent.progress * 100);

              setPeerCount(numPeers);
              setProgress(pct);

              // ✅ If we got ANY progress, clear the 5s no-progress timer
              if (pct > 0 && noProgressTimeoutRef.current) {
                clearTimeout(noProgressTimeoutRef.current);
                noProgressTimeoutRef.current = null;
              }

              // ✅ If we are ready, clear the 15s overall timer
              if (isReady && overallTimeoutRef.current) {
                clearTimeout(overallTimeoutRef.current);
                overallTimeoutRef.current = null;
              }

              if (pct >= 3 && !isReady) {
                setIsReady(true);
                // Clear overall timer immediately
                if (overallTimeoutRef.current) {
                  clearTimeout(overallTimeoutRef.current);
                  overallTimeoutRef.current = null;
                }
                if (torrentResult.url) {
                  setVideoSrc(torrentResult.url);
                  setStatus("p2p_streaming");
                }
              }
            };

            activeTorrent.on("wire", updateStats);
            activeTorrent.on("download", updateStats);
            activeTorrent.on("piece", updateStats);

            if (activeTorrent.pieces > 0) {
              const firstPieces = Math.max(
                1,
                Math.floor(activeTorrent.pieces * 0.1),
              );
              activeTorrent.select(0, firstPieces - 1);
            }
          }

          if (torrentResult.url && isMountedRef.current) {
            p2pHitRef.current = true;
            setVideoSrc(torrentResult.url);
            setStatus("p2p_streaming");
            setIsReady(true);
          }
        } catch (err) {
          console.log("P2P Error:", err.message);
          // If add() fails, instantly fall back to Pinata
          const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
          setVideoSrc(cachedUrl);
          setStatus("fallback_http");
          setIsReady(true);
          // Clear timers
          if (noProgressTimeoutRef.current) clearTimeout(noProgressTimeoutRef.current);
          if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current);
        }
      } else if (fallbackUrl && isMountedRef.current) {
        // If NO magnet link exists, use the fallback immediately
        const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
        setVideoSrc(cachedUrl);
        setStatus("fallback_http");
        setIsReady(true);
      }

      // 4. Cache in background
      if (fallbackUrl) {
        fetchIPFSForCache(fallbackUrl);
      }
    };

    const fetchIPFSForCache = async (url) => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok && isMountedRef.current) {
          const blob = await response.blob();
          const fileName = media.fileName || `media-${media.cid}`;
          const mimeType =
            blob.type ||
            (fileName.endsWith(".mp4")
              ? "video/mp4"
              : fileName.endsWith(".png")
                ? "image/png"
                : "image/jpeg");
          saveMedia(media.cid, blob, mimeType, fileName);
        }
      } catch (e) {
        // Silent catch
      }
    };

    loadMedia();

    return () => {
      isMountedRef.current = false;

      // ✅ KILL SWITCH: Clear the new timers
      if (noProgressTimeoutRef.current) clearTimeout(noProgressTimeoutRef.current);
      if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current);

      // ✅ Destroy the torrent to free memory
      if (activeTorrent) {
        activeTorrent.destroy();
        console.log("🧹 Destroyed torrent for non-focused item");
      }

      // ✅ Revoke blob URL
      if (currentUrlRef.current && currentUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
      }
    };
  }, [
    isFocused,
    media.magnetLink,
    media.cid,
    media.ipfsUrl,
    media.fallbackUrl,
    media.fileName,
    media.slices,
  ]);

  // Loading state
  if (!videoSrc || !isReady) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#00ffff" size="large" />
        <Text style={styles.statusText}>
          {status === "checking_cache" && "📦 Loading from cache..."}
          {status === "connecting_p2p" && "🌐 Connecting to peers..."}
          {status === "p2p_swarming" && `📡 Swarming (${progress}%)`}
          {status === "initializing" && "⏳ Initializing..."}
          {status === "fallback_http" && "🌍 Loading video..."}
        </Text>
        {status === "p2p_swarming" && progress > 0 && (
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress}%` }]} />
          </View>
        )}
      </View>
    );
  }

  // ✅ UPDATED: Includes AVIF, HEIC, HEIF, SVG
  const isImage =
    media.fileType === "image" ||
    media.type === "image" ||
    media.fileName?.match(/\.(jpg|jpeg|png|gif|webp|avif|heic|heif|svg)$/i);

  if (isImage) {
    return <img src={videoSrc} style={styles.image} alt="User content" />;
  }

  return (
    <View style={styles.container}>
      <video
        ref={videoRef}
        src={videoSrc}
        style={styles.video}
        muted={!isFocused}
        controls
        playsInline
        preload="auto"
        onLoadedData={() => console.log("🎬 Video loaded and ready")}
        onError={(e) => console.log("❌ Video error:", e)}
      />
      <View style={styles.overlayStatus}>
        <ActivityIndicator
          size="small"
          color={status.startsWith("p2p") ? "#00ff00" : "#00ffff"}
        />
        <Text style={styles.overlayText}>
          {status === "p2p_streaming" &&
            `🚀 P2P (${peerCount} peers, ${progress}%)`}
          {status === "p2p_swarming" && `🌊 Swarming (${progress}%)`}
          {status === "fallback_http" && "🌍 HTTP"}
          {status === "cached" && "💾 Cache"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: "#000",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
  },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
    backgroundColor: "#111",
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
  },
  progressBarContainer: {
    width: "80%",
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    marginTop: 12,
  },
  progressBar: {
    height: "100%",
    backgroundColor: "#00ffff",
    borderRadius: 2,
  },
  overlayStatus: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  overlayText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
});
