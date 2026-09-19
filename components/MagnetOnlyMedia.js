// components/MagnetOnlyMedia.jsx
import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import webtorrentService from "../utils/webtorrentService";

export default function MagnetOnlyMedia({ media, isFocused, onPeerUpdate }) {
  const [videoSrc, setVideoSrc] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [peerCount, setPeerCount] = useState(0);
  const mountedRef = useRef(true);
  const videoRef = useRef(null);

  // Normalize the input. Accept magnetLink or magnetURI, array or object.
  const item = Array.isArray(media) ? media[0] : media;
  const magnetLink = item?.magnetLink || item?.magnetURI || null;
  const isImage =
    item?.fileType === "image" ||
    item?.mediaType === "image" ||
    item?.fileName?.match(/\.(jpg|jpeg|png|gif|webp|avif|heic|heif|svg)$/i);

  useEffect(() => {
    if (!isFocused || !magnetLink) return;

    mountedRef.current = true;
    let activeTorrent = null;

    const load = async () => {
      try {
        setStatus("connecting");
        const client = await webtorrentService.ensureClient();
        if (!mountedRef.current) return;

        const existing = await client.get(magnetLink);
        const torrent =
          existing ||
          await client.add(magnetLink, {
            announce: webtorrentService.trackers,
            strategy: "sequential",
          });

        activeTorrent = torrent;

        const updateStats = () => {
          if (!mountedRef.current) return;
          const n = torrent.numPeers || 0;
          setPeerCount(n);
          if (onPeerUpdate) onPeerUpdate(n);
        };
        torrent.on("wire", updateStats);
        torrent.on("download", updateStats);
        updateStats();

        const file = torrent.files?.[0];
        if (!file) {
          setStatus("no-file");
          return;
        }

        const blob = await file.blob();
        if (!mountedRef.current) return;

        const url = URL.createObjectURL(blob);
        setVideoSrc(url);
        setStatus("ready");
      } catch (err) {
        console.error("MagnetOnlyMedia:", err.message);
        if (mountedRef.current) setStatus("error");
      }
    };

    load();

    return () => {
      mountedRef.current = false;
      if (activeTorrent) {
        try {
          const client = window.globalWebTorrentClient;
          if (client) client.remove(activeTorrent.infoHash).catch(() => {});
        } catch (e) {}
      }
    };
  }, [isFocused, magnetLink, onPeerUpdate]);

  if (!videoSrc) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator color="#00ffff" size="large" />
        <Text style={styles.status}>
          {status === "connecting" && "Connecting to peers…"}
          {status === "no-file" && "No playable file in torrent"}
          {status === "error" && "Couldn't load from peers"}
        </Text>
        {peerCount > 0 && <Text style={styles.peers}>{peerCount} peers</Text>}
      </View>
    );
  }

  if (isImage) {
    return <img src={videoSrc} style={styles.image} alt="Media" />;
  }

  return (
    <video
      ref={videoRef}
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
    minHeight: 200,
    backgroundColor: "#111",
  },
  status: { color: "#fff", marginTop: 10, fontSize: 14 },
  peers: { color: "#00ffff", marginTop: 6, fontSize: 12 },
  video: { width: "100%", height: "100%", objectFit: "contain" },
  image: { width: "100%", height: "100%", objectFit: "contain" },
});
