// components/WebTorrentImage.js - UPDATED VERSION
import React, { useEffect, useRef, useState } from "react";
import { Platform, View, Image, StyleSheet, Text } from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentImage({ image, isFocused }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const imageRef = useRef(null);

  // Extract CID from various sources
  const extractCID = () => {
    if (image.cid) return image.cid;

    // Try to extract from fileName (like "bafybeice7irhylgivwudidy2lnogpm2gxtmsf62ayges656ju26anl3i3e.jpeg")
    if (image.fileName) {
      const cidFromFileName = image.fileName.split(".")[0];
      if (
        cidFromFileName.startsWith("Qm") ||
        cidFromFileName.startsWith("baf")
      ) {
        return cidFromFileName;
      }
    }

    return null;
  };

  const cid = extractCID();

  useEffect(() => {
    if (Platform.OS !== "web") {
      // For native, use direct IPFS URL
      if (cid) {
        setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
      }
      return;
    }

    const loadImage = async () => {
      try {
        const client = window.globalWebTorrentClient;

        // If no magnet link or no CID, use direct IPFS if available
        if (!image.magnetLink || !cid) {
          console.log("🖼️ No magnet link or CID, using direct IPFS for image");
          if (cid) {
            setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
          }
          setStatus("Loaded via IPFS");
          return;
        }

        if (!client) {
          throw new Error("Global WebTorrent client not found");
        }

        setStatus("Connecting to swarm...");

        // Check if torrent already exists
        let torrent = client.get(image.magnetLink);

        if (!torrent) {
          torrent = client.add(image.magnetLink);
        }

        // Add web seed for faster loading
        if (cid) {
          torrent.addWebSeed(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
        }

        // Set up event listeners
        torrent.on("download", () => {
          setProgress(Math.round(torrent.progress * 100));
          setPeers(torrent.numPeers);
          setStatus(`Downloading: ${Math.round(torrent.progress * 100)}%`);
        });

        torrent.on("ready", () => {
          setStatus("Finding image file...");

          // Look for image files in the torrent
          const file = torrent.files.find((f) =>
            f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
          );

          if (!file) {
            console.warn(
              "❌ No image file found in torrent, using IPFS fallback"
            );
            setStatus("No image in torrent, using IPFS");
            if (cid) {
              setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
            }
            return;
          }

          // Create blob URL for the image
          file.getBlobURL((err, url) => {
            if (err) {
              console.error("❌ Blob URL error:", err);
              setStatus("P2P failed, using IPFS");
              if (cid) {
                setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
              }
              return;
            }

            setImageUrl(url);
            setStatus("Loaded via P2P");
            setProgress(100);
          });
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, using IPFS");
          if (cid) {
            setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
          }
        });

        // Timeout fallback
        setTimeout(
          () => {
            if (!imageUrl && cid) {
              setStatus("P2P timeout, using IPFS");
              setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
            }
          },
          isFocused ? 8000 : 30000
        );
      } catch (error) {
        console.error("Error loading image:", error);
        setStatus("Error, using IPFS fallback");
        if (cid) {
          setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
        }
      }
    };

    loadImage();
  }, [image.magnetLink, cid, isFocused]);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        {cid ? (
          <Image
            source={{ uri: `https://${PINATA_GATEWAY}/ipfs/${cid}` }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.status}>No image data available</Text>
          </View>
        )}
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
          onLoad={() => console.log("✅ Image loaded via", status)}
          onError={() => {
            console.log("❌ Image load failed, falling back to IPFS");
            setStatus("Image load failed");
            if (cid) {
              setImageUrl(`https://${PINATA_GATEWAY}/ipfs/${cid}`);
            }
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
    width: "100%",
    maxWidth: 800,
    backgroundColor: "#000",
    borderRadius: 12,
    overflow: "hidden",
    alignSelf: "center",
  },
  image: {
    width: "100%",
    height: undefined,
    aspectRatio: 4 / 3,
    minHeight: 300,
  },
  placeholder: {
    height: 400,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },
  status: {
    color: "#fff",
    textAlign: "center",
    marginBottom: 12,
    fontSize: 16,
  },
  progress: {
    color: "#888",
    fontSize: 14,
  },
});
