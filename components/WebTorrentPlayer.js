import React, { useEffect, useState, useRef } from "react";
import { Platform, View, StyleSheet, Text } from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentPlayer({ video, isFocused }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const videoRef = useRef(null);

  useEffect(() => {
    if (Platform.OS !== "web") {
      setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
      return;
    }

    const loadVideo = async () => {
      try {
        const client = window.globalWebTorrentClient;

        if (!client) {
          throw new Error("Global WebTorrent client not found");
        }

        if (!video.magnetLink) {
          setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
          setStatus("Loaded via IPFS");
          return;
        }

        setStatus("Connecting to swarm...");

        let torrent =
          client.get(video.magnetLink) || client.add(video.magnetLink);

        if (video.cid) {
          torrent.addWebSeed(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
        }

        torrent.on("download", () => {
          const percent = Math.round(torrent.progress * 100);
          setProgress(percent);
          setPeers(torrent.numPeers);
          setStatus(`Downloading: ${percent}%`);

          // Start playing when we have some data
          if (percent >= 5 && !videoUrl) {
            const file = torrent.files.find((f) =>
              f.name.match(/\.(mp4|mov|webm)$/i)
            );

            if (file) {
              file.getBlobURL((err, url) => {
                if (!err) {
                  setVideoUrl(url);
                  setStatus("Playing via P2P");
                }
              });
            }
          }
        });

        torrent.on("error", (err) => {
          console.error("Torrent error:", err);
          setStatus("P2P failed, using IPFS");
          setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
        });

        // Timeout fallback
        setTimeout(
          () => {
            if (!videoUrl) {
              setStatus("P2P timeout, using IPFS");
              setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
            }
          },
          isFocused ? 1000 : 4500
        );
      } catch (error) {
        console.error("Error loading video:", error);
        setStatus("Error, using IPFS fallback");
        setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
      }
    };

    loadVideo();
  }, [video.magnetLink, video.cid, isFocused]);

  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>P2P not available on native</Text>
        {/* Use expo-video here for native */}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {videoUrl ? (
        <video
          ref={videoRef}
          src={videoUrl}
          controls
          style={styles.video}
          onLoadStart={() => console.log("Video loading")}
          onError={() => {
            setStatus("Video load failed");
            setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
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
    height: 300,
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
  },
  status: {
    color: "#fff",
    textAlign: "center",
    marginBottom: 8,
  },
  progress: {
    color: "#888",
    fontSize: 12,
  },
});
