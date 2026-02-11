import React, { useState, useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getMedia, saveMedia } from "../components/mediaCache";

export default function WebTorrentMedia({ media, isFocused }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [status, setStatus] = useState("initializing");
  const [progress, setProgress] = useState(0);
  const videoRef = useRef(null);
  const currentUrlRef = useRef(null);
  const torrentRef = useRef(null);
  const timeoutRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    const loadMedia = async () => {
      // 1. Check cache first (fast)
      try {
        console.log("🔍 Checking cache...");
        setStatus("checking_cache");
        const cachedData = await getMedia(media.cid);

        if (cachedData?.blob && isMountedRef.current) {
          console.log("✅ Playing from Cache");
          const url = URL.createObjectURL(cachedData.blob);
          currentUrlRef.current = url;
          setVideoSrc(url);
          setStatus("streaming");
          setProgress(100);
          return;
        }
      } catch (err) {
        console.log("Cache miss:", err.message);
      }

      // 2. Set fallback URL immediately (for better UX)
      if (media.ipfsUrl || media.fallbackUrl) {
        console.log("🐢 Setting fallback URL while trying P2P...");
        setVideoSrc(media.ipfsUrl || media.fallbackUrl);
        setStatus("fallback_loading");
      }

      // 3. Start WebTorrent attempt with timeout
      if (window.globalWebTorrentClient && media.magnetLink) {
        console.log("🪱 Attempting WebTorrent (2s timeout + 2s grace)...");
        startWebTorrentWithTimeout();
      } else {
        console.log("⚠️ No WebTorrent, using fallback only");
        setStatus("fallback_only");
      }

      // 4. Also try IPFS fetch for caching (in background)
      if (media.ipfsUrl || media.fallbackUrl) {
        fetchIPFSForCache();
      }
    };

    const startWebTorrentWithTimeout = () => {
      const client = window.globalWebTorrentClient;
      let hasProgress = false;

      // Initial timeout: 2 seconds
      timeoutRef.current = setTimeout(() => {
        if (!hasProgress && isMountedRef.current) {
          console.log("⏱️ WebTorrent timeout - no progress after 2s");
          setStatus("fallback_only");
        }
      }, 2000);

      const torrent = client.add(media.magnetLink, (torrent) => {
        torrentRef.current = torrent;

        torrent.on("download", (bytes) => {
          hasProgress = true;
          const currentProgress = torrent.progress;
          setProgress(Math.round(currentProgress * 100));

          // If we get progress, extend timeout by 2 more seconds
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
              if (isMountedRef.current && torrent.progress < 1) {
                console.log("⏱️ WebTorrent grace period expired");
                setStatus("fallback_only");
              }
            }, 2000);
          }

          if (currentProgress === 1) {
            console.log("🎯 WebTorrent complete!");
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
            }

            const file = torrent.files.find((f) =>
              f.name.match(/\.(mp4|mov|jpg|jpeg|png|gif|webp)$/i),
            );

            if (file) {
              file.getBlob(async (err, blob) => {
                if (!err && blob && isMountedRef.current) {
                  // Upgrade to blob URL
                  const url = URL.createObjectURL(blob);
                  if (currentUrlRef.current) {
                    URL.revokeObjectURL(currentUrlRef.current);
                  }
                  currentUrlRef.current = url;
                  setVideoSrc(url);
                  setStatus("streaming");

                  // Save to cache
                  const mimeType = file.name.endsWith(".mp4")
                    ? "video/mp4"
                    : file.name.endsWith(".png")
                      ? "image/png"
                      : "image/jpeg";
                  saveMedia(media.cid, blob, mimeType, file.name);
                }
              });
            }
          }
        });

        torrent.on("error", (err) => {
          console.error("WebTorrent error:", err);
          if (isMountedRef.current) {
            setStatus("fallback_only");
          }
        });
      });
    };

    const fetchIPFSForCache = async () => {
      // Only fetch if we don't already have it cached
      try {
        const url = media.ipfsUrl || media.fallbackUrl;
        if (!url) return;

        console.log("🌐 Fetching from IPFS for caching...");

        // Use AbortController to limit fetch time
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);

        const response = await fetch(url, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const blob = await response.blob();

          // Only cache if we don't already have a blob from WebTorrent
          // and component is still mounted
          if (isMountedRef.current && !torrentRef.current) {
            // Check if we should update to this blob (if still on fallback URL)
            if (
              videoSrc === url ||
              videoSrc === media.ipfsUrl ||
              videoSrc === media.fallbackUrl
            ) {
              const newUrl = URL.createObjectURL(blob);
              if (
                currentUrlRef.current &&
                currentUrlRef.current.startsWith("blob:")
              ) {
                URL.revokeObjectURL(currentUrlRef.current);
              }
              currentUrlRef.current = newUrl;
              setVideoSrc(newUrl);
              setStatus("streaming");
            }

            // Cache it for next time
            const fileName = media.fileName || `media-${media.cid}`;
            const mimeType =
              blob.type ||
              (fileName.endsWith(".mp4")
                ? "video/mp4"
                : fileName.endsWith(".png")
                  ? "image/png"
                  : "image/jpeg");
            saveMedia(media.cid, blob, mimeType, fileName);

            console.log("✅ IPFS fetch successful and cached");
          }
        }
      } catch (err) {
        console.log("IPFS fetch failed (background):", err.message);
        // Silent fail - we're already showing fallback
      }
    };

    loadMedia();

    return () => {
      isMountedRef.current = false;

      // Cleanup
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      if (torrentRef.current) {
        try {
          torrentRef.current.destroy();
        } catch (e) {
          console.warn("Error cleaning up torrent:", e);
        }
      }
    };
  }, [
    media.magnetLink,
    media.cid,
    media.ipfsUrl,
    media.fallbackUrl,
    media.fileName,
  ]);

  if (!videoSrc) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#00ffff" />
        <Text style={styles.statusText}>
          {status === "checking_cache"
            ? "Checking cache..."
            : "Initializing..."}
        </Text>
      </View>
    );
  }

  const isImage =
    media.type === "image" ||
    media.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

  if (isImage) {
    return <img src={videoSrc} style={styles.image} alt="User content" />;
  }

  return (
    <>
      <video
        ref={videoRef}
        src={videoSrc}
        style={styles.video}
        autoPlay
        muted={!isFocused}
        controls
        playsInline
        loop
      />
      {status !== "streaming" && (
        <View style={styles.overlayStatus}>
          <ActivityIndicator size="small" color="#00ffff" />
          <Text style={styles.overlayText}>
            {status === "fallback_loading" && "Loading via IPFS..."}
            {status === "fallback_only" && "Using IPFS fallback"}
            {progress > 0 && progress < 100 && `P2P: ${progress}%`}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  video: {
    width: "100%",
    height: "100%",
    // On Web, native controls are part of the element's height.
    // 'contain' keeps them inside the parent.
    objectFit: "contain",
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#000",
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "contain",
    backgroundColor: "#000",
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
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overlayText: {
    color: "#00ffff",
    fontSize: 10,
  },
});
