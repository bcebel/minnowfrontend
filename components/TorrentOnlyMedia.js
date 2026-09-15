// WebTorrentMedia.js - ULTIMATE CACHING VERSION (Background Cache)
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
  //console.log(`💾 Pinata cached: ${cid}`);
  return url;
};

export default function WebTorrentMedia({ media, isFocused, isAlmostFocused }) {
    const [videoSrc, setVideoSrc] = useState(null);
    const [status, setStatus] = useState("initializing");
    const [progress, setProgress] = useState(0);
    const [peerCount, setPeerCount] = useState(0);
    const [isReady, setIsReady] = useState(false);
let cachedUrl = useRef(null);;
    const videoRef = useRef(null);
    const currentUrlRef = useRef(null);
    const isMountedRef = useRef(true);
    const p2pHitRef = useRef(false);
    const progressRef = useRef(0);

    const overallTimeoutRef = useRef(null);
    const noProgressTimeoutRef = useRef(null);

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
                    } catch (e) { }
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
                .catch(() => { });
        };

        const loadMedia = async () => {
            // 1. Check local device cache (fastest, instant hit)
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

            // 2. PRIORITIZE P2P FIRST
            if (media?.magnetLink) {
                try {
                    if (isMountedRef.current) setStatus("connecting_p2p");

                    // Set fallback timeouts to catch missing peers
                    overallTimeoutRef.current = setTimeout(() => {
                        if (!isReady && isMountedRef.current) {
                            triggerHttpFallback("15s timeout reached");
                        }
                    }, 15000);

                    noProgressTimeoutRef.current = setTimeout(() => {
                        if (!isReady && progressRef.current === 0 && isMountedRef.current) {
                            triggerHttpFallback("5s no-progress timeout");
                        }
                    }, 5000);

                    // Add magnet with HTTP web seeding enabled
                    const torrentResult = await webtorrentService.add(media.magnetLink, {
                        urlList: fallbackUrl ? [fallbackUrl] : [],
                        strategy: "sequential",
                        maxWebConns: 4,
                    });

                    if (!isMountedRef.current) return;
                    activeTorrent = torrentResult.torrent;

                    if (activeTorrent) {
                        // PRIORITIZATION: Force download of head and tail pieces first (for MP4 header/moov)
                        const setupPrioritySelection = () => {
                            if (activeTorrent.pieces.length > 0) {
                                // Select first 10% and last 2% of pieces
                                const headPieces = Math.max(
                                    1,
                                    Math.floor(activeTorrent.pieces.length * 0.1),
                                );
                                const tailPieces = Math.max(
                                    1,
                                    Math.floor(activeTorrent.pieces.length * 0.02),
                                );

                                activeTorrent.select(0, headPieces - 1, 1); // High priority
                                activeTorrent.select(
                                    activeTorrent.pieces.length - tailPieces,
                                    activeTorrent.pieces.length - 1,
                                    1,
                                );
                            }
                        };

                        if (activeTorrent.ready) {
                            setupPrioritySelection();
                        } else {
                            activeTorrent.once("ready", setupPrioritySelection);
                        }

                        // Cache completed P2P download locally
                        activeTorrent.on("done", () => {
                            if (isMountedRef.current && activeTorrent.files[0]) {
                                activeTorrent.files[0].getBuffer((err, buffer) => {
                                    if (!err && buffer) {
                                        const blob = new Blob([buffer]);
                                        saveCachedMedia(blob, media.fileName);
                                    }
                                });
                            }
                        });

                        // Track stats and render video on first readable chunks
                        const updateStats = () => {
                            if (!isMountedRef.current) return;
                            const numPeers = activeTorrent.numPeers || 0;
                            const pct = Math.floor(activeTorrent.progress * 100);
                            progressRef.current = pct;

                            setPeerCount(numPeers);
                            setProgress(pct);

                            // Clear no-progress timeout once pieces arrive
                            if (pct > 0 && noProgressTimeoutRef.current) {
                                clearTimeout(noProgressTimeoutRef.current);
                                noProgressTimeoutRef.current = null;
                            }

                            // Render video as soon as we hit >= 1% buffered stream
                            if ((pct >= 1 || activeTorrent.downloaded > 524288) && !isReady) {
                                setIsReady(true);
                                if (overallTimeoutRef.current) {
                                    clearTimeout(overallTimeoutRef.current);
                                    overallTimeoutRef.current = null;
                                }
                                if (torrentResult.url) {
                                    p2pHitRef.current = true;
                                    setVideoSrc(torrentResult.url);
                                    setStatus("p2p_streaming");
                                }
                            }
                        };

                        activeTorrent.on("wire", updateStats);
                        activeTorrent.on("download", updateStats);
                        activeTorrent.on("piece", updateStats);
                    }

                    if (torrentResult.url && isMountedRef.current) {
                        p2pHitRef.current = true;
                        setVideoSrc(torrentResult.url);
                        setStatus("p2p_streaming");
                        setIsReady(true);
                    }
                } catch (err) {
                    console.log("P2P Error:", err.message);
                    triggerHttpFallback("P2P connection error");
                }
            } else {
                triggerHttpFallback("No magnet link provided");
            }

            // 3. Helper to handle HTTP Fallback & delayed background cache
            function triggerHttpFallback(reason) {
                if (!isMountedRef.current) return;
                console.log(`🌍 Switching to HTTP fallback (${reason})`);

                if (noProgressTimeoutRef.current)
                    clearTimeout(noProgressTimeoutRef.current);
                if (overallTimeoutRef.current) clearTimeout(overallTimeoutRef.current);

             cachedUrl = getCachedPinataUrl(media.cid, fallbackUrl);
                setVideoSrc(cachedUrl);
                setStatus("fallback_http");
                setIsReady(true);

                // Run HTTP background cache ONLY when P2P isn't handling the stream
                startBackgroundCache();
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
                <ActivityIndicator color="#a5b0b0" size="large" />
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
        media.fileName?.match(/\.(jpg|jpeg|png|gif|webp|avif|heic|heif|svg)$/i);

    if (isImage) {
        return <img src={videoSrc} style={styles.image} alt="User content" />;
    }

    if (cachedUrl !== videoSrc) {
        return (
            <View style={styles.container}>
                <video
                    ref={videoRef}
                    src={videoSrc}
                    style={styles.video}
                    muted={true}
                    playsInline
                    autoPlay
                    preload="auto"
                    onLoadedData={() => console.log("🎬 Video loaded and ready")}
                    onError={() => {
                        console.log(
                            "Video element failed to load. Forcing HTTP fallback.",
                        );
                        const cachedUrl = getCachedPinataUrl(
                            media.cid,
                            media.ipfsUrl || media.fallbackUrl,
                        );
                        if (cachedUrl && cachedUrl !== videoSrc) {
                            setVideoSrc(cachedUrl);
                            setStatus("fallback_http");
                        }
                    }}
                />
                <View style={styles.overlayStatus}>
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
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: "#000",
  },
  video: { width: "100%", height: "100%", objectFit: "contain" },
  image: { width: "100%", height: "100%", objectFit: "contain" },
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
  progressBar: { height: "100%", backgroundColor: "#00ffff", borderRadius: 2 },
  overlayStatus: {
    position: "absolute",
    bottom: 10,
    right: 15,
  },
  overlayText: {
    color: "rgba(255,255,255,.8)",
    fontSize: 10,

    bottom: 1,
  },
});
