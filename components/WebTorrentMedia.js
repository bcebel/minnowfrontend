import React, { useState, useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet, Text } from "react-native";
import { getMedia, saveMedia } from "../components/mediaCache";

export default function WebTorrentMedia({ media, isFocused }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [status, setStatus] = useState("connecting");
  const videoRef = useRef(null);
  const currentUrlRef = useRef(null); // Keep track of the URL for cleanup

  useEffect(() => {
    let isMounted = true;

    const startLoading = async () => {
      // 1. Check Cache First
      const cachedData = await getMedia(media.cid);

      if (cachedData?.blob && isMounted) {
        console.log("🚀 Playing from Cache");
        const url = URL.createObjectURL(cachedData.blob);
        currentUrlRef.current = url;
        setVideoSrc(url);
        setStatus("streaming");
        return;
      }

      // 2. If NOT in cache, set fallback immediately so it starts loading
      // This solves the "video doesn't populate" issue
      console.log("🐢 Cache miss, starting with Pinata/IPFS Fallback");
      setVideoSrc(media.ipfsUrl || media.fallbackUrl);
      setStatus("fallback");

      // 3. WebTorrent Logic (Attempt to "upgrade" to P2P and cache it)
      if (window.globalWebTorrentClient && media.magnetLink) {
        const client = window.globalWebTorrentClient;

        client.add(media.magnetLink, (torrent) => {
 const file = torrent.files.find((f) =>
   f.name.match(/\.(mp4|mov|jpg|jpeg|png|gif|webp)$/i)
 );

          if (file && isMounted) {
            file.getBlob(async (err, blob) => {
              if (!err && blob && isMounted) {
                // If we were on fallback, upgrade to the P2P blob
                const url = URL.createObjectURL(blob);

                // Cleanup old URL if it was a blob
                if (currentUrlRef.current)
                  URL.revokeObjectURL(currentUrlRef.current);

                currentUrlRef.current = url;
                setVideoSrc(url);
                setStatus("streaming");

                // Save to cache for next time
const mimeType = file.name.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
saveMedia(media.cid, blob, mimeType, file.name);              }
            });
          }
        });
      }
    };

    startLoading();

    return () => {
      isMounted = false;
      // 🧹 CRITICAL: Clear memory to prevent ERR_BLOB_OUT_OF_MEMORY
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, [media.magnetLink, media.cid]);

  if (!videoSrc) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#00ffff" />
        <Text style={{ color: "#fff", fontSize: 10, marginTop: 10 }}>
          Initializing...
        </Text>
      </View>
    );
  }

  // Helper to check if it's an image
  const isImage =
    media.type === "image" ||
    media.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

  if (isImage) {
    return (
      <img
        src={videoSrc} // This holds our Blob URL or IPFS URL
        style={styles.image}
        alt="User content"
      />
    );
  }

  return (
    <video
      ref={videoRef}
      src={videoSrc}
      style={styles.video}
      autoPlay
      muted
      controls
      playsInline
      loop
    />
  );
}

const styles = StyleSheet.create({
  video: { width: "100%", height: "100%", backgroundColor: "#000" },
  image: {
    width: "100%",
    height: "auto",
    objectFit: "contain",
    backgroundColor: "#000",
  }, // Added image style
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 200,
  },
});


