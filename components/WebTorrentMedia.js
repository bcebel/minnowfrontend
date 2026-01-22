import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
const myTracker = "wss://tracker-0ad4cca9fd92.herokuapp.com";

export default function WebTorrentMedia({ media }) {
  const [mediaUrl, setMediaUrl] = useState(null);
  const [status, setStatus] = useState("Initializing...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const torrentRef = useRef(null);

  const { magnetLink, fileName, imageUrl, videoUrl } = media;
  const isImage =
    media.fileType === "image" ||
    fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

  useEffect(() => {
    let isActive = true;

    const startP2P = async () => {
      // 1. Wait for the Champ
      let client = window.globalWebTorrentClient;
      if (!client) {
        setStatus("Waiting for P2P...");
        return;
      }

      if (!magnetLink) {
        // Fallback to IPFS if no magnet exists
        setMediaUrl(imageUrl || videoUrl);
        return;
      }

      // 2. Check if already seeding (OWNER CHECK)
      let torrent = client.get(magnetLink);

      if (!torrent) {
        setStatus("Connecting to peers...");
        torrent = client.add(magnetLink, {
          announce: [myTracker],
        });
      }

      torrentRef.current = torrent;

      // 3. THE "OWNER" SHORT-CIRCUIT
      // If we have 100% of the file, show it NOW.
      if (torrent.progress === 1 && torrent.files[0]) {
        torrent.files[0].getBlobURL((err, url) => {
          if (isActive && !err) {
            setMediaUrl(url);
            setStatus("Ready (Seeding)");
          }
        });
      }

      // 4. Update stats and handle download
      const updateStats = () => {
        if (!isActive) return;
        setProgress(Math.round(torrent.progress * 100));
        setPeers(torrent.numPeers);

        // If we just hit 100% or enough to show
        if (torrent.progress > 0.05 && !mediaUrl) {
          torrent.files[0].getBlobURL((err, url) => {
            if (isActive && !err) setMediaUrl(url);
          });
        }
      };

      torrent.on("download", updateStats);
      torrent.on("wire", updateStats);
      torrent.on("done", () => {
        setStatus("Ready");
        updateStats();
      });
    };

    startP2P();

    return () => {
      isActive = false;
      // Note: Don't destroy the torrent here if you want to keep seeding
      // while navigating other parts of the chat!
    };
  }, [magnetLink]);

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
          <video src={mediaUrl} controls style={styles.video} autoPlay />
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
    height: 200,
    justifyContent: "center",
    alignItems: "center",
  },
  status: { color: "#fff", marginTop: 10 },
  progress: { color: "#00ffff", fontSize: 12 },
});
