// WebTorrentMedia.js - ULTIMATE CACHING VERSION (Background Cache)
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
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
  //console.log(`💾 Pinata cached: ${cid}`);
  return url;
};

export default function WebTorrentMedia({ media, isFocused, isAlmostFocused }) {
  const [videoSrc, setVideoSrc] = useState(media?.ipfsUrl);
  const [status, setStatus] = useState("p2p_streaming");
  const [progress, setProgress] = useState(0);
  const [peerCount, setPeerCount] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const videoRef = useRef(null);
  const currentUrlRef = useRef(null);
  const isMountedRef = useRef(true);
  const p2pHitRef = useRef(false);
  const progressRef = useRef(0);
  const [isPaused, setIsPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1); // 1 = 100% max volume volume
    const [isMuted, setIsMuted] = useState(true); // Matches your video element's muted={true} default setting
    const [isVolumeHovered, setIsVolumeHovered] = useState(false);
    const progressBarRef = useRef(null);
    const timerRef = useRef(null);

    const [controlsVisible, setControlsVisible] = useState(true);

  const overallTimeoutRef = useRef(null);
  const noProgressTimeoutRef = useRef(null);
const resetActivityTimer = () => {
  setControlsVisible(true);
  if (timerRef.current) clearTimeout(timerRef.current);
  if (videoRef.current && videoRef.current.paused) return;

  timerRef.current = setTimeout(() => {
    setControlsVisible(false);
  }, 1000);
};

useEffect(() => {
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, []);

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);

    if (videoRef.current) {
      videoRef.current.volume = newVolume;
      // Automatically toggle off mute if the user slides volume up
      if (newVolume > 0 && isMuted) {
        videoRef.current.muted = false;
        setIsMuted(false);
      } else if (newVolume === 0) {
        videoRef.current.muted = true;
        setIsMuted(true);
      }
    }
  };

  // Click handler to toggle speaker muting settings instantly
  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMutedState = !isMuted;
    videoRef.current.muted = nextMutedState;
    setIsMuted(nextMutedState);

    // Reset slider view location if unmuting from a zero volume state
    if (!nextMutedState && volume === 0) {
      videoRef.current.volume = 0.5;
      setVolume(0.5);
    }
  };
// --- 3. VIDEO INTERACTIONS ---
const togglePlay = () => {
  if (!videoRef.current) return;
  if (videoRef.current.paused) {
    videoRef.current.play();
    setIsPaused(false);
    resetActivityTimer();
  } else {
    videoRef.current.pause();
    setIsPaused(true);
    setControlsVisible(true);
  }
};

const handleSeek = (e) => {
  if (!videoRef.current || duration === 0 || !progressBarRef.current) return;
  const rect = progressBarRef.current.getBoundingClientRect();
  let percentage = (e.clientX - rect.left) / rect.width;
  if (percentage < 0) percentage = 0;
  if (percentage > 1) percentage = 1;

  const newTime = percentage * duration;
  videoRef.current.currentTime = newTime;
  setCurrentTime(newTime);
};

const formatTime = (secs) => {
  if (isNaN(secs) || secs === null) return "00:00";
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(secs % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  useEffect(() => {
    if (isFocused) return; // focused path handles itself
    if (!isAlmostFocused) return; // out of lookahead window
    if (!media.magnetLink) return; // nothing to prefetch

    let cancelled = false;

    const warmQuietly = async () => {
      // 1. Already cached? Nothing to do.
      const cached = await getMedia(media.cid);
      if (cached?.blob || cancelled) return;

      // 2. Attach to the magnet, don't wait for anything
      try {
        const client = await webtorrentService.ensureClient();
        if (cancelled) return;

        const existing = client.get(media.magnetLink);
        const torrent =
          existing ||
          client.add(media.magnetLink, {
            announce: webtorrentService.trackers,
            strategy: "sequential",
          });

        if (cancelled) return;

        const onDone = async () => {
          if (cancelled) return;
          try {
            const buffer = await new Promise((res, rej) =>
              torrent.files[0].getBuffer((err, buf) =>
                err ? rej(err) : res(buf),
              ),
            );
            const type = torrent.files[0].type || "video/mp4";
            const blob = new Blob([buffer], { type });
            await saveMedia(media.cid, blob, type, media.fileName);
          } catch (e) {}
        };

        torrent.once("done", onDone);

        // Cleanup: if this leaves the window, remove the listener
        // (but don't destroy the torrent — the global client owns it)
        return () => {
          cancelled = true;
          torrent.removeListener("done", onDone);
        };
      } catch (e) {
        // silent — prefetch is best-effort
      }
    };

    warmQuietly();
  }, [isAlmostFocused, isFocused, media.cid, media.magnetLink]);

  useEffect(() => {
    if (!isFocused) return;

    isMountedRef.current = true;
    p2pHitRef.current = false;
    progressRef.current = 0;

    let activeTorrent = null;
    const fallbackUrl = media.ipfsUrl || media.fallbackUrl;

    // ✅ BACKGROUND CACHE DOWNLOAD (Starts immediately, saves even if you scroll away)
    // ✅ BACKGROUND CACHE DOWNLOAD (Saves even if you scroll away)
    const startBackgroundCache = async () => {
      if (!fallbackUrl) return;
      try {
        const response = await fetch(fallbackUrl);
        const blob = await response.blob();
        if (blob && blob.size > 0) {
          const fileName = media.fileName || `media-${media.cid}`;
          const mimeType =
            blob.type ||
            (fileName.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
          // Await the save so it's ready next time!
          await saveMedia(media.cid, blob, mimeType, fileName);
          // console.log("💾 Background cache saved:", media.cid);
        }
      } catch (e) {
        // Silent catch
      }
    };

    // ✅ Helper to save blob from P2P when it completes
    const saveCachedMedia = (blob, fileName) => {
      if (!blob) return;
      let mimeType = blob.type;
      if (!mimeType) {
        const ext = (fileName || "").split(".").pop().toLowerCase();
        mimeType = ext === "mp4" ? "video/mp4" : "image/jpeg";
      }
      saveMedia(media.cid, blob, mimeType, fileName || `media-${media.cid}`)
        .then(() => console.log("💾 Saved to cache:", media.cid))
        .catch(() => {});
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

      // 2. Start background cache immediately (so even if you scroll away, it'll be saved)
      startBackgroundCache();

      // 3. Check multi-slice video
      if (media.slices && media.slices.length > 1) {
        try {
          setStatus("connecting_slices");
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
          saveCachedMedia(combined, media.fileName);
          return;
        } catch (err) {
          console.log("Slice assembly failed:", err.message);
        }
      }

      // 4. GIVE P2P A CHANCE
      if (media?.magnetLink) {
        try {
          if (isMountedRef.current) setStatus("connecting_p2p");

          overallTimeoutRef.current = setTimeout(() => {
            if (!isReady && isMountedRef.current) {
              // console.log("⏰ 15s overall timeout. Forcing HTTP.");
              const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
              setVideoSrc(cachedUrl);
              setStatus("fallback_http");
              setIsReady(true);
              if (noProgressTimeoutRef.current)
                clearTimeout(noProgressTimeoutRef.current);
            }
          }, 15000);

          noProgressTimeoutRef.current = setTimeout(() => {
            if (!isReady && progressRef.current === 0 && isMountedRef.current) {
              // console.log("🐌 No progress in 5s. Forcing HTTP.");
              const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
              setVideoSrc(cachedUrl);
              setStatus("fallback_http");
              setIsReady(true);
              if (overallTimeoutRef.current)
                clearTimeout(overallTimeoutRef.current);
            }
          }, 5000);

          const torrentResult = await webtorrentService.add(media.magnetLink, {
            urlList: fallbackUrl ? [fallbackUrl] : [],
            strategy: "sequential",
            maxWebConns: 4,
          });

          if (!isMountedRef.current) return;
          activeTorrent = torrentResult.torrent;

          if (activeTorrent) {
            activeTorrent.files[0].blob().then((blob) => {
              saveCachedMedia(blob, media.fileName);
            });

            const updateStats = () => {
              if (!isMountedRef.current) return;
              const numPeers = activeTorrent.numPeers || 0;
              const pct = Math.floor(activeTorrent.progress * 100);
              progressRef.current = pct;

              setPeerCount(numPeers);
              setProgress(pct);

              if (pct > 0 && noProgressTimeoutRef.current) {
                clearTimeout(noProgressTimeoutRef.current);
                noProgressTimeoutRef.current = null;
              }
              if (isReady && overallTimeoutRef.current) {
                clearTimeout(overallTimeoutRef.current);
                overallTimeoutRef.current = null;
              }

              if (pct >= 3 && !isReady) {
                setIsReady(true);
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
          //  console.log("P2P Error:", err.message);
          const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
          setVideoSrc(cachedUrl);
          setStatus("fallback_http");
          setIsReady(true);
          if (noProgressTimeoutRef.current)
            clearTimeout(noProgressTimeoutRef.current);
          if (overallTimeoutRef.current)
            clearTimeout(overallTimeoutRef.current);
        }
      } else if (fallbackUrl && isMountedRef.current) {
        const cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
        setVideoSrc(cachedUrl);
        setStatus("fallback_http");
        setIsReady(true);
      }
    };

    loadMedia();

    return () => {
      isMountedRef.current = false;
      if (noProgressTimeoutRef.current)
        clearTimeout(noProgressTimeoutRef.current);
      if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current);

      // If already ready, don't destroy; keeps it mounted for instant access
      if (isReady) return;

      // If still loading, kill the torrent to save memory
      if (activeTorrent) {
        activeTorrent.destroy();
      }
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

  if (!isFocused) return null;

  if (!videoSrc || !isReady) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#0f0f0f" size="large" />
        <Text style={styles.statusText}>
          {status === "checking_cache" && "📦 Loading from cache..."}
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
    media.fileName?.match(/\.(jpg|jpeg|png|gif|webp|avif|heic|heif|svg)$/i);

  if (isImage) {
    return <img src={videoSrc} style={styles.image} alt="User content" />;
  }

  // Custom control states

  // Toggle Play / Pause using the standard web element API
 

  // Tracks time changes to update your progress bar
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Captures full video length once metadata loads
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      console.log("🎬 Video loaded and ready");
    }
  };

  // Calculate track bar percentage
 

   // --- 4. THE LIVE VIEW TREE ---
  return (
    <View
      style={styles.container}
      // @ts-ignore
      onMouseMove={resetActivityTimer}
      onMouseLeave={() => !isPaused && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        style={styles.video}
        muted={isMuted}
        volume={volume}
        loop={true}
        playsInline
        autoPlay
        preload="auto"
        onTimeUpdate={() =>
          videoRef.current && setCurrentTime(videoRef.current.currentTime)
        }
        onLoadedMetadata={() =>
          videoRef.current && setDuration(videoRef.current.duration)
        }
        onLoadedData={() => console.log("🎬 Video loaded and ready")}
        onClick={togglePlay}
        onEnded={() => {
          setIsPaused(false);
          resetActivityTimer();
        }}
        onError={(e) => console.log("❌ Video error:", e)}
      />

      <View
        style={[
          styles.controlsOverlay,
          { opacity: controlsVisible ? 1 : 0 },
          !controlsVisible && { pointerEvents: "none" },
        ]}
      >
 

        <TouchableOpacity style={styles.centerPlayButton} onPress={togglePlay}>
          <Text style={styles.playIconText}>{isPaused ? "▶" : "❚❚"}</Text>
        </TouchableOpacity>

        <View style={styles.bottomControlBar}>
          {/* 1. Current Time Label */}
          <Text style={styles.timeLabel}>{formatTime(currentTime)}</Text>

          {/* 2. LOCKED VOLUME CONTAINER (No more hover tracking functions!) */}
          <View style={styles.volumeControlContainer}>
            <TouchableOpacity style={styles.volumeButton} onPress={toggleMute}>
              <Text style={styles.volumeIconText}>
                {isMuted || volume === 0 ? "🔇" : volume < 0.5 ? "🔉" : "🔊"}
              </Text>
            </TouchableOpacity>

            {/* This slider is now locked wide open at 60px permanently */}
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              style={{
                cursor: "pointer",
                height: "4px",
                backgroundColor: "#00ffff",
                accentColor: "#00ffff",
                outline: "none",
                border: "none",
                marginLeft: "6px",
                width: "60px", // <--- Forces it to stay wide open
                opacity: 1, // <--- Forces it to stay completely visible
                display: "block", // <--- Ensures it never hides on web viewports
              }}
            />
          </View>

          {/* 3. The Clickable Timeline Seek Bar */}
          <TouchableOpacity
            activeOpacity={1}
            style={styles.seekHitbox}
            onPress={handleSeek}
          >
            <View ref={progressBarRef} style={styles.progressBarTrack}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${progressPercent}%` },
                ]}
              />
              <View
                style={[styles.progressKnob, { left: `${progressPercent}%` }]}
              />
            </View>
          </TouchableOpacity>

          {/* 4. Total Duration Label */}
          <Text style={styles.timeLabel}>{formatTime(duration)}</Text>
        </View>
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
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    cursor: "pointer",
  },
  image: { width: "100%", height: "100%", objectFit: "contain" },
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
    backgroundColor: "#111",
  },
  statusText: {
    color: "rgb(255, 255, 255)",
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
  progressBar: { height: "100%", backgroundColor: "#00ffff", borderRadius: 2 },
  controlsOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10, // @ts-ignore
    transition: "opacity 0.25s ease-in-out",
  },
  topBar: { position: "absolute", top: 15, right: 15 },
  overlayStatus: {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  overlayText: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  centerPlayButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)", // @ts-ignore
    backdropFilter: "blur(6px)",
  },
  playIconText: { color: "#fff", fontSize: 20, marginLeft: 2 },
  bottomControlBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center", // @ts-ignore
    backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))",
  },
  seekHitbox: {
    flex: 1,
    paddingVertical: 10,
    marginHorizontal: 12,
    cursor: "pointer",
  },
  progressBarTrack: {
    height: 4,
    backgroundColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 2,
    width: "100%",
    position: "relative",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#00ffff",
    borderRadius: 2,
  },
  progressKnob: {
    position: "absolute",
    top: -4,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    marginLeft: -6,
    boxShadow: "0px 2px 6px rgba(0,0,0,0.5)",
  },
  timeLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  volumeControlContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 6,
    marginRight: 12,

    marginLeft: 12,
    height: "100%",
  },
  volumeButton: {
    padding: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  volumeIconText: {
    color: "#fff",
    fontSize: 16,
  },
});
