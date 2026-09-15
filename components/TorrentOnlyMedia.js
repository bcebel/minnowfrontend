// components/TorrentOnlyMedia.js
import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import webtorrentService from "../utils/webtorrentService";

export default function TorrentOnlyMedia({ media, onPeerUpdate }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [peerCount, setPeerCount] = useState(0);
  const [status, setStatus] = useState("connecting");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const load = async () => {
      try {
        const result = await webtorrentService.add(media.magnetLink, {
          strategy: "sequential",
        });
        if (!mountedRef.current) return;
        setVideoSrc(result.url);
        setStatus("ready");

        const torrent = result.torrent;
        const updateStats = () => {
          if (!mountedRef.current) return;
          const n = torrent.numPeers || 0;
          setPeerCount(n);
          if (onPeerUpdate) onPeerUpdate(n);
        };
        torrent.on("wire", updateStats);
        torrent.on("download", updateStats);
        updateStats();

        return () => {
          torrent.removeListener("wire", updateStats);
          torrent.removeListener("download", updateStats);
        };
      } catch (err) {
        if (!mountedRef.current) return;
        setStatus("error");
        console.error("TorrentOnlyMedia:", err.message);
      }
    };

    const cleanup = load();
    return () => {
      mountedRef.current = false;
      if (cleanup && typeof cleanup.then === "function") {
        cleanup.then((fn) => fn && fn());
      }
    };
  }, [media.magnetLink]);

  if (!videoSrc) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#a5b0b0" size="large" />
        <Text style={styles.status}>
          {status === "connecting" && "Connecting to peers…"}
          {status === "error" && "Couldn't connect"}
        </Text>
      </View>
    );
  }

  return (
    <video
      src={videoSrc}
      style={styles.video}
      muted
      autoPlay
      playsInline
      controls
    />
  );
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#111",
    minHeight: 200,
  },
  status: { color: "#fff", marginTop: 10 },
  video: { width: "100%", height: "100%", objectFit: "contain" },
});
