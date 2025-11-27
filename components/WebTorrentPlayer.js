// components/WebTorrentPlayer.js
import React, { useEffect, useRef, useState } from "react";
import {
  Platform,
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";

const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;

export default function WebTorrentPlayer({ video, isFocused }) {
  const [videoUrl, setVideoUrl] = useState(null);
  const [status, setStatus] = useState("Loading...");
  const [progress, setProgress] = useState(0);
  const [peers, setPeers] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);
  const torrentRef = useRef(null);

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

        setStatus("Connecting to P2P swarm...");

        let torrent =
          client.get(video.magnetLink) || client.add(video.magnetLink);

        torrentRef.current = torrent;

        if (video.cid) {
          torrent.addWebSeed(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
        }

        torrent.on("download", () => {
          const percent = Math.round(torrent.progress * 100);
          setProgress(percent);
          setPeers(torrent.numPeers);
          setStatus(`Downloading: ${percent}% from ${torrent.numPeers} peers`);

          // Start playing when we have some data
          if (percent >= 5 && !videoUrl && !isPlaying) {
            const file = torrent.files.find((f) =>
              f.name.match(/\.(mp4|mov|webm|webm)$/i)
            );

            if (file) {
              file.getBlobURL((err, url) => {
                if (!err) {
                  setVideoUrl(url);
                  setStatus("Ready to play");
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

        // Timeout fallback for live streams
        setTimeout(
          () => {
            if (!videoUrl && !isPlaying) {
              setStatus("P2P timeout, using IPFS");
              setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
            }
          },
          isFocused ? 15000 : 45000
        );
      } catch (error) {
        console.error("Error loading video:", error);
        setStatus("Error, using IPFS fallback");
        setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
      }
    };

    loadVideo();

    // Cleanup function
    return () => {
      if (torrentRef.current) {
        // Don't destroy the torrent - keep it seeding for others
        console.log("Keeping torrent alive for seeding");
      }
    };
  }, [video.magnetLink, video.cid, isFocused]);

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
      setStatus("Playing");
    }
  };

  const handleStop = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
      setStatus("Stopped");
    }
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
    setStatus("Playback ended");
  };

  if (Platform.OS !== "web") {
    return (
      <View style={styles.container}>
        <Text style={styles.status}>P2P not available on native</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Video player or loading state */}
      {videoUrl ? (
        <View style={styles.videoWrapper}>
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            style={styles.video}
            onLoadStart={() => console.log("Video loading")}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={handleVideoEnd}
            onError={() => {
              setStatus("Video load failed");
              setVideoUrl(`https://${PINATA_GATEWAY}/ipfs/${video.cid}`);
            }}
          />

          {/* Custom controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[
                styles.controlButton,
                isPlaying ? styles.stopButton : styles.playButton,
              ]}
              onPress={isPlaying ? handleStop : handlePlay}
            >
              <Text style={styles.controlButtonText}>
                {isPlaying ? "⏹️ Stop" : "▶️ Play"}
              </Text>
            </TouchableOpacity>

            <View style={styles.statusInfo}>
              <Text style={styles.statusText}>{status}</Text>
              <Text style={styles.peerText}>{peers} peers</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.loadingContainer}>
          <Text style={styles.status}>{status}</Text>
          <Text style={styles.progress}>
            {progress}% • {peers} peers
          </Text>
          {progress > 0 && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
            </View>
          )}
        </View>
      )}

      {/* Video info */}
      <View style={styles.videoInfo}>
        <Text style={styles.fileName} numberOfLines={1}>
          {video.fileName || "Live Stream"}
        </Text>
        {video.magnetLink && (
          <Text style={styles.magnetHint}>
            🔗 P2P Live Stream - {peers} peers seeding
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
    borderRadius: 8,
    overflow: "hidden",
    marginBottom: 8,
  },
  videoWrapper: {
    position: "relative",
  },
  video: {
    width: "100%",
    height: 200,
    backgroundColor: "#000",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
  },
  controlButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 60,
    alignItems: "center",
  },
  playButton: {
    backgroundColor: "#00FF00",
  },
  stopButton: {
    backgroundColor: "#FF4444",
  },
  controlButtonText: {
    color: "#000",
    fontWeight: "bold",
    fontSize: 12,
  },
  statusInfo: {
    alignItems: "flex-end",
  },
  statusText: {
    color: "#FFF",
    fontSize: 12,
  },
  peerText: {
    color: "#00FF00",
    fontSize: 10,
  },
  loadingContainer: {
    height: 200,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 16,
  },
  status: {
    color: "#FFF",
    textAlign: "center",
    marginBottom: 8,
    fontSize: 14,
  },
  progress: {
    color: "#00FF00",
    fontSize: 12,
    marginBottom: 8,
  },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#00FF00",
    borderRadius: 2,
  },
  videoInfo: {
    padding: 8,
    backgroundColor: "#111",
  },
  fileName: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  magnetHint: {
    color: "#00FF00",
    fontSize: 10,
    marginTop: 2,
  },
});
