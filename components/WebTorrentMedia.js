// WebTorrentMedia.js - FINAL CLEAN VERSION
import React, { useState, useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getMedia, saveMedia } from "../components/mediaCache";
import webtorrentService from "../utils/webtorrentService";

const PINATA_GATEWAY =
  process.env.EXPO_PUBLIC_PINATA_GATEWAY || "gateway.pinata.cloud";

// ✅ Move cache OUTSIDE the component
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
    const startTimeRef = useRef(Date.now());
    const lastProgressTimeRef = useRef(Date.now());
    const lastProgressPctRef = useRef(0);

  const videoRef = useRef(null);
  const currentUrlRef = useRef(null);
  const isMountedRef = useRef(true);
  const p2pHitRef = useRef(false);
  const fallbackTimerRef = useRef(null);
  const stuckTimerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    p2pHitRef.current = false;

    let activeTorrent = null;

    const fallbackUrl = media.ipfsUrl || media.fallbackUrl;

    // ✅ STUCK TIMER: If we start downloading but stall, bail out to Pinata
    const setupStuckTimer = () => {
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      stuckTimerRef.current = setTimeout(() => {
        if (isMountedRef.current && !isReady) {
          console.log("P2P stuck (15s). Forcing HTTP fallback.");
          const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
          setVideoSrc(cachedUrl);
          setStatus("fallback_http");
          setIsReady(true);
        }
      }, 15000);
    };

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

      // ✅ SKIP THE PINATA CACHE RETURN! (We are letting P2P try first)

      // ✅ Check if this is a multi-slice video
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

      // ✅ GIVE P2P A CHANCE: Start P2P first, THEN set up the fallback timer
      if (media?.magnetLink) {
        try {
          if (isMountedRef.current) setStatus("connecting_p2p");

          // 1. Start the torrent
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

                      // ✅ 1. CLEAR the fallback timer ONLY if we have peers
                      if (
                        (pct > 0 || numPeers > 0) &&
                        fallbackTimerRef.current
                      ) {
                        clearTimeout(fallbackTimerRef.current);
                        fallbackTimerRef.current = null;
                        p2pHitRef.current = true;
                      }

                      // ✅ 2. THE "CRAWLER" CHECK: If we're below 100% and haven't gained 10% in the last second, bail.
                      const currentTime = Date.now();
                      if (
                        pct < 100 &&
                        currentTime - lastProgressTimeRef.current > 1000
                      ) {
                        // Only check this if we've been actively downloading
                        if (pct > 0) {
                          const progressSinceLastSecond =
                            pct - lastProgressPctRef.current;

                          // If we gained LESS than 10% in the last second, it's a crawl.
                          if (progressSinceLastSecond < 10) {
                            console.log(
                              "⏰ P2P is crawling too slowly (less than 10%/sec). Forcing HTTP!",
                            );
                            const cachedUrl = getCachedPinataUrl(
                              media.cid,
                              fallbackUrl,
                            );
                            setVideoSrc(cachedUrl);
                            setStatus("fallback_http");
                            setIsReady(true);

                            // Kill all timers
                            if (stuckTimerRef.current) {
                              clearTimeout(stuckTimerRef.current);
                              stuckTimerRef.current = null;
                            }
                            if (fallbackTimerRef.current) {
                              clearTimeout(fallbackTimerRef.current);
                              fallbackTimerRef.current = null;
                            }
                            return; // Stop updating stats
                          }
                        }
                      }

                      // ✅ 3. Keep track of last progress time and percentage
                      lastProgressTimeRef.current = currentTime;
                      lastProgressPctRef.current = pct;

                      // ✅ 4. THE "TIMES UP" CHECK: If 15 seconds have passed since start, Pinata busts in.
                      const timeSinceStart = Date.now() - startTimeRef.current;
                      if (timeSinceStart > 15000 && !isReady) {
                        console.log(
                          "⏰ 15-second overall cutoff reached. Forcing HTTP!",
                        );
                        const cachedUrl = getCachedPinataUrl(
                          media.cid,
                          fallbackUrl,
                        );
                        setVideoSrc(cachedUrl);
                        setStatus("fallback_http");
                        setIsReady(true);

                        // Kill all timers
                        if (stuckTimerRef.current) {
                          clearTimeout(stuckTimerRef.current);
                          stuckTimerRef.current = null;
                        }
                        if (fallbackTimerRef.current) {
                          clearTimeout(fallbackTimerRef.current);
                          fallbackTimerRef.current = null;
                        }
                        return;
                      }

                      // ✅ 5. Only kill the stuck timer when we reach 100% (or a usable threshold)
                      if (pct >= 100 && !isReady) {
                        setIsReady(true);

                        // Kill all timers
                        if (stuckTimerRef.current) {
                          clearTimeout(stuckTimerRef.current);
                          stuckTimerRef.current = null;
                        }
                        if (fallbackTimerRef.current) {
                          clearTimeout(fallbackTimerRef.current);
                          fallbackTimerRef.current = null;
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

          // ✅ 2. START THE FALLBACK TIMER NOW (it starts AFTER we try P2P first!)
          fallbackTimerRef.current = setTimeout(() => {
            if (!p2pHitRef.current && isMountedRef.current && fallbackUrl) {
              console.log("P2P timeout (5s). Falling back to HTTP.");
              const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
              setVideoSrc(cachedUrl);
              setStatus("fallback_http");
              setIsReady(true);
            }
          }, 5000);
        } catch (err) {
          console.log("P2P Error:", err.message);
          if (isMountedRef.current && !p2pHitRef.current && fallbackUrl) {
            const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
            setVideoSrc(cachedUrl);
            setStatus("fallback_http");
            setIsReady(true);
          }
        }
      } else if (fallbackUrl && isMountedRef.current) {
        // If NO magnet link exists, use the fallback immediately
        const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
        setVideoSrc(cachedUrl);
        setStatus("fallback_http");
        setIsReady(true);
      }

      // 5. Cache in background
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
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      if (stuckTimerRef.current) clearTimeout(stuckTimerRef.current);
      if (currentUrlRef.current && currentUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
      if (activeTorrent) {
        activeTorrent.removeAllListeners();
      }
    };
  }, [
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

  const isImage =
    media.fileType === "image" ||
    media.type === "image" ||
    media.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

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
