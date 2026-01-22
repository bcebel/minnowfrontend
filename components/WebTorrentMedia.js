import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";

// 1. IMPORT YOUR CACHE (Ensure mediaCache.js exists in same folder)
import { mediaCache } from "./mediaCache";

const myTracker = "wss://tracker-0ad4cca9fd92.herokuapp.com";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentMedia({ media }) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Initializing...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const torrentRef = useRef(null);

  const { magnetLink, fileName, cid } = media;
  const isImage =
    media.fileType === "image" ||
    fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
  const ipfsUrl = cid ? `https://${PINATA_GATEWAY}/ipfs/${cid}` : null;

  useEffect(() => {
    let isActive = true;
    let fallbackTimer = null;

    const startMediaFlow = async () => {
      // --- STAGE 1: LOCAL CACHE CHECK ---
      if (cid) {
        const cached = await mediaCache.getMedia(cid);
        if (cached && isActive) {
     const safariFriendlyBlob = new Blob([cached.blob], {
       type: cached.mimeType,
     });
     const url = URL.createObjectURL(safariFriendlyBlob);
          setMediaUrl(url);
          setStatus("Ready (Cached)");
          return;
        }
      }

      // --- STAGE 2: P2P ATTEMPT ---
      let client = window.globalWebTorrentClient;
      if (!client || !magnetLink) {
        // No P2P available, go straight to Pinata
        if (ipfsUrl) setMediaUrl(ipfsUrl);
        return;
      }

      let torrent = client.get(magnetLink);
      if (!torrent) {
        torrent = client.add(magnetLink, { announce: [myTracker] });
      }
      torrentRef.current = torrent;

      // --- STAGE 3: PINATA FALLBACK TIMER ---
      // If after 5 seconds we don't have enough data, use Pinata
      fallbackTimer = setTimeout(() => {
        if (isActive && !mediaUrl && ipfsUrl) {
          console.log("🐢 P2P slow, falling back to Pinata");
          setMediaUrl(ipfsUrl);
          setStatus("Loaded via Pinata");
        }
      }, 5000);

      const handleData = () => {
        if (!isActive) return;
        const p = Math.round(torrent.progress * 100);
        setProgress(p);
        setPeers(torrent.numPeers);

        // If we hit a threshold (5% for video, 100% for image)
        const threshold = isImage ? 1 : 0.05;
        if (torrent.progress >= threshold && !mediaUrl) {
          torrent.files[0].getBlob(async (err, blob) => {
            if (isActive && !err && blob) {
              const url = URL.createObjectURL(blob);
              setMediaUrl(url);
              setStatus("Ready (P2P)");
              // SAVE TO CACHE for next time
              if (cid)
                await mediaCache.saveMedia(cid, blob, blob.type, fileName);
              clearTimeout(fallbackTimer);
            }
          });
        }
      };

      torrent.on("download", handleData);
      torrent.on("done", handleData);

      // If already done (Seeder side)
      if (torrent.progress >= 1) handleData();
    };

    startMediaFlow();

    return () => {
      isActive = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
    };
  }, [magnetLink, cid]);

  return (
    <View style={styles.container}>
      {mediaUrl ? (
        isImage ? (
          <Image
            source={{ uri: mediaUrl }}
            style={styles.image}
            contentFit="contain"
          />
        ) : (
          <video src={mediaUrl} controls style={styles.video} autoPlay muted />
        )
      ) : (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#00ffff" />
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.progress}>
            {progress}% • {peers} peers
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#130720",
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
  },
  image: { width: "100%", height: 300 },
  video: { width: "100%", height: 300 },
  loadingContainer: {
    height: 250,
    justifyContent: "center",
    alignItems: "center",
  },
  status: { color: "#fff", marginTop: 10 },
  progress: { color: "#00ffff", fontSize: 12 },
});
