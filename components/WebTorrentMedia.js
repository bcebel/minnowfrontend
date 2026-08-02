import React, { useState, useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getMedia, saveMedia } from "../components/mediaCache";
import webtorrentService from "../utils/webtorrentService";

export default function WebTorrentMedia({ media, isFocused }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [status, setStatus] = useState("initializing");
  const [progress, setProgress] = useState(0);
  const [peerCount, setPeerCount] = useState(0);

  const videoRef = useRef(null);
  const currentUrlRef = useRef(null);
  const isMountedRef = useRef(true);
  const p2pHitRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    p2pHitRef.current = false;

    let activeTorrent = null;
    let p2pTimer = null;

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
          return;
        }
      } catch (err) {
        console.log("Cache miss:", err.message);
      }

      // 2. Set up 6-Second P2P Discovery Window
      // Direct HTTP will ONLY trigger if P2P hasn't started delivering chunks in 6s
      p2pTimer = setTimeout(() => {
        if (!p2pHitRef.current && isMountedRef.current && fallbackUrl) {
          console.log(
            "P2P discovery timed out (6s). Falling back to direct HTTP.",
          );
          setVideoSrc(fallbackUrl);
          setStatus("fallback_http");
        }
      }, 6000);

      // 3. Initiate P2P Swarming via WebTorrentService
      if (media.magnetLink) {
        try {
          if (isMountedRef.current) setStatus("connecting_p2p");

          const torrentResult = await webtorrentService.add(media.magnetLink, {
            // WebSeeding: WebTorrent fetches from Pinata INSIDE the P2P swarm
            urlList: fallbackUrl ? [fallbackUrl] : [],
          });

          if (!isMountedRef.current) return;

          activeTorrent = torrentResult.torrent;

          if (activeTorrent) {
            // Monitor peer connectivity and download progress
            const updateStats = () => {
              if (!isMountedRef.current) return;
              const numPeers = activeTorrent.numPeers || 0;
              const pct = Math.floor(activeTorrent.progress * 100);

              setPeerCount(numPeers);
              setProgress(pct);

              // If P2P gets any download traction, mark P2P as active
              if (pct > 0 || numPeers > 0) {
                p2pHitRef.current = true;
                if (status !== "streaming") setStatus("p2p_swarming");
              }
            };

            activeTorrent.on("wire", updateStats);
            activeTorrent.on("download", updateStats);
          }

          // 4. Stream ready: Hand playable blob URL to video player
          if (torrentResult.url && isMountedRef.current) {
            p2pHitRef.current = true;
            if (p2pTimer) clearTimeout(p2pTimer);

            if (
              currentUrlRef.current &&
              currentUrlRef.current.startsWith("blob:")
            ) {
              URL.revokeObjectURL(currentUrlRef.current);
            }
            currentUrlRef.current = torrentResult.url;
            setVideoSrc(torrentResult.url);
            setStatus("p2p_streaming");
          }
        } catch (err) {
          console.log("P2P Error:", err.message);
          // If P2P errors explicitly, drop immediately to HTTP
          if (isMountedRef.current && !p2pHitRef.current && fallbackUrl) {
            setVideoSrc(fallbackUrl);
            setStatus("fallback_http");
          }
        }
      } else if (fallbackUrl && isMountedRef.current) {
        // No magnet link present at all
        setVideoSrc(fallbackUrl);
        setStatus("fallback_http");
      }

      // 5. Cache response for future opens
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
        // Silent catch for background caching
      }
    };

    loadMedia();

    return () => {
      isMountedRef.current = false;
      if (p2pTimer) clearTimeout(p2pTimer);
      if (currentUrlRef.current && currentUrlRef.current.startsWith("blob:")) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, [media.magnetLink, media.cid, media.ipfsUrl, media.fallbackUrl]);

  // Loading state (Shows while checking cache or connecting to P2P peers)
  if (!videoSrc) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#00ffff" />
        <Text style={styles.statusText}>
          {status === "checking_cache" && "Checking local storage..."}
          {status === "connecting_p2p" && "Connecting to P2P Swarm..."}
          {status === "initializing" && "Initializing..."}
        </Text>
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
      />
      {/* Visual Indicator of P2P vs HTTP State */}
      <View style={styles.overlayStatus}>
        <ActivityIndicator
          size="small"
          color={status.startsWith("p2p") ? "#00ff00" : "#00ffff"}
        />
        <Text style={styles.overlayText}>
          {status === "p2p_streaming" &&
            `P2P Active (${peerCount} peers, ${progress}%)`}
          {status === "p2p_swarming" && `Swarming P2P (${progress}%)`}
          {status === "fallback_http" && "HTTP Backup (Pinata)"}
          {status === "cached" && "Device Cache"}
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
    fontSize: 12,
    marginTop: 10,
    textAlign: "center",
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
