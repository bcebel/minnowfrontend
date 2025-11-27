import React, { useEffect, useState, useRef } from "react";
import { Platform, View, Image, StyleSheet, Text } from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentImage({ image, isFocused }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const imageRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      // Fallback for native
      setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
      return;
    }

    const loadImage = async () => {
      try {
        const client = window.globalWebTorrentClient;

        if (!client) {
          throw new Error("Global WebTorrent client not found");
        }

        if (!image.magnetLink) {
          // No magnet, use direct IPFS
          setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
          setStatus("Loaded via IPFS");
          return;
        }

        setStatus("Connecting to swarm...");

        // Check if torrent already exists
        let torrent = client.get(image.magnetLink);

        if (!torrent) {
          torrent = client.add(image.magnetLink);
        }

        // Add web seed for faster loading
        if (image.cid) {
          torrent.addWebSeed(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
        }

        // Set up event listeners
        torrent.on("download", () => {
          setProgress(Math.round(torrent.progress * 100));
          setPeers(torrent.numPeers);
          setStatus(`Downloading: ${Math.round(torrent.progress * 100)}%`);
        });

        torrent.on("ready", () => {
          setStatus("Finding image file...");

          const file = torrent.files.find((f) =>
            f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
          );

          if (!file) {
            throw new Error("No image file found in torrent");
          }

          // Create blob URL for the image
          file.getBlobURL((err, url) => {
            if (err) throw err;

            setImageUrl(url);
            setStatus("Loaded via P2P");
            setProgress(100);
          });
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, using IPFS fallback");
          setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
        });

        // Timeout fallback
        setTimeout(
          () => {
            if (!imageUrl) {
              setStatus("P2P timeout, using IPFS");
              setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
            }
          },
          isFocused ? 4000 : 15000
        );
      } catch (error) {
        console.error("Error loading image:", error);
        setStatus("Error, using IPFS fallback");
        setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
      }
    };

    loadImage();
  }, [image.magnetLink, image.cid, isFocused]);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        <Image
          source={{ uri: `https://${PINATA_GATEWAY}/ipfs/${image.cid}` }}
          style={styles.image}
          resizeMode="contain"
        />
        <Text style={styles.status}>P2P not available on native</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {imageUrl ? (
        <Image
          ref={imageRef}
          source={{ uri: imageUrl }}
          style={styles.image}
          resizeMode="contain"
          onLoad={() => console.log("Image loaded")}
          onError={() => {
            setStatus("Image load failed");
            setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${image.cid}`);
          }}
        />
      ) : (
        <View style={styles.placeholder}>
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
    width: "100%", // Take full available width
    maxWidth: 800, // Maximum size
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",  },
  image: {
    width: "100%",
    height: undefined,
    aspectRatio: 4 / 3, // Maintain aspect ratio
    minHeight: 300, // Minimum height
  },
  placeholder: {
    height: 400, // Larger placeholder
    backgroundColor: "#111",
  },
  status: {
    color: "#fff",
    marginBottom: 12,
    fontSize: 16,
  },
  progress: {
    color: "#888",
    fontSize: 14,
  },
});