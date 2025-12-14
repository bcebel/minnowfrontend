// components/NeighborhoodLiveStreamPlayer.jsx
import { useState } from "react";
import { View, TouchableOpacity, Text, ActivityIndicator } from "react-native";
import { NeighborhoodVideoReassembler } from "../utils/NeighborhoodVideoReassembler";

export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  streamTitle,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reassembler, setReassembler] = useState(null);

  const startWatching = async () => {
    setIsLoading(true);

    // Make sure WebTorrent is loaded
    if (!window.WebTorrent) {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
      document.head.appendChild(script);
      await new Promise((resolve) => (script.onload = resolve));
    }

    try {
      const reassembler = new NeighborhoodVideoReassembler(sessionId);
      setReassembler(reassembler);

      await reassembler.startLivePlayback();

      setIsPlaying(true);
      setIsLoading(false);

      // Auto-update status
      const statusInterval = setInterval(() => {
        if (!document.getElementById("liveStreamPlayer")) {
          clearInterval(statusInterval);
          setIsPlaying(false);
        }
      }, 1000);
    } catch (error) {
      console.error("❌ Failed to start playback:", error);
      setIsLoading(false);
      alert(`Playback error: ${error.message}`);
    }
  };

  const stopWatching = () => {
    if (reassembler) {
      reassembler.stopPlayback();
    }
    setIsPlaying(false);
  };

  return (
    <View style={{ marginVertical: 10 }}>
      {!isPlaying ? (
        <TouchableOpacity
          onPress={startWatching}
          disabled={isLoading}
          style={{
            backgroundColor: "#00cc00",
            padding: 15,
            borderRadius: 10,
            alignItems: "center",
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Text
                style={{ color: "white", fontWeight: "bold", fontSize: 16 }}
              >
                ▶️ WATCH LIVE STREAM
              </Text>
              <Text style={{ color: "white", fontSize: 12, marginTop: 5 }}>
                {streamTitle || "Neighborhood Live"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      ) : (
        <View style={{ alignItems: "center" }}>
          <Text style={{ color: "#00cc00", fontWeight: "bold" }}>
            🔴 LIVE STREAM PLAYING
          </Text>
          <Text style={{ fontSize: 12, color: "#666", marginTop: 5 }}>
            Close the video player to stop
          </Text>
          <TouchableOpacity
            onPress={stopWatching}
            style={{
              backgroundColor: "#ff4444",
              padding: 10,
              borderRadius: 6,
              marginTop: 10,
            }}
          >
            <Text style={{ color: "white" }}>Stop Watching</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
