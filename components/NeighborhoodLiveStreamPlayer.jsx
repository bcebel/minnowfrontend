// --- THE  WHOLE POINT OF THIS FILE IS TO PROVIDE A LIVE STREAM PLAYER THAT USES WEBTORRENT TO STREAM VIDEO CHUNKS FROM A P2P NETWORK --- //
// DONT DEFAULT TO SERVER VIDEO. INSTEAD, USE WEBTORRENT TO PULL VIDEO CHUNKS FROM PEERS. USE SERVER AS FALLBACK ONLY IF NO PEERS HAVE THE DATA READILY AVAILABLE. //
// KEEP TORRENTS ALIVE AS LONG AS POSSIBLE WITHOUT OVERLOADING THE BROWSER. USE A WAREHOUSE TO CACHE VIDEO CHUNKS LOCALLY. //

import React, { useEffect, useRef, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { warehouse } from "../components/StreamWearhouse.js";
import webtorrentService from "../utils/webtorrentService.js";
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// --- THE STREAM CONTROLLER (The Engine) ---
class StreamController {
  constructor(sessionId, videoElement, addLog) {
    this.sessionId = sessionId;
    this.video = videoElement;
    this.addLog = addLog;
    this.nextIndex = 0;
    this.headerLoaded = false;
    this.isProcessing = false;
    this.detectedMimeType = 'video/mp4; codecs="avc1.4d401f, mp4a.40.2"';

    this.MS = window.ManagedMediaSource || window.MediaSource;
    this.ms = new this.MS();
    this.video.src = URL.createObjectURL(this.ms);

    this.ms.addEventListener("sourceopen", () => this.tick());
    this.watchdog = setInterval(() => this.tick(), 2000);
  }

  async download(index) {
    // 1. Local Cache First
    const cached = await warehouse.getChunk(this.sessionId, index);
    if (cached) return cached;

    // 2. Server Fallback (Since P2P might be slow on 'New' streams)
    try {
      const res = await fetch(
        `${BACKEND_URL}/api/live-chunk/${this.sessionId}/${index}`,
      );
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const data = new Uint8Array(buf);
        await warehouse.saveChunk(this.sessionId, index, data);
        return data;
      }
    } catch (e) {
      this.addLog(`❌ Download ${index} failed`);
    }
    return null;
  }

  async tick() {
    if (this.isProcessing || this.ms.readyState !== "open") return;

    if (!this.sb) {
      this.sb = this.ms.addSourceBuffer(this.detectedMimeType);
      this.sb.mode = "sequence";
      this.sb.addEventListener("updateend", () => {
        this.isProcessing = false;
        this.tick();
      });
    }

    if (this.sb.updating) return;

    // Logic for Header
    if (!this.headerLoaded) {
      const data = await this.download(-1);
      if (data) {
        this.isProcessing = true;
        this.sb.appendBuffer(data);
        this.headerLoaded = true;
        this.video.play().catch(() => {});
      }
      return;
    }

    // Logic for Chunks
    const data = await this.download(this.nextIndex);
    if (data) {
      this.isProcessing = true;
      this.sb.appendBuffer(data);
      this.nextIndex++;
    }
  }

  destroy() {
    clearInterval(this.watchdog);
    this.video.src = "";
    if (this.ms.readyState === "open") this.ms.endOfStream();
  }
}
// --- THE REACT COMPONENT ---
export const NeighborhoodLiveStreamPlayer = ({
  sessionId,
  autoPlay,
  muted,
}) => {
  const videoRef = useRef(null);
  const controllerRef = useRef(null);

  useEffect(() => {
    if (!sessionId || !videoRef.current) return;
    controllerRef.current = new StreamController(
      sessionId,
      videoRef.current,
      (m) => console.log(m),
    );
    return () => controllerRef.current?.destroy();
  }, [sessionId]);

  return (
    <View style={styles.container}>
      <video
        ref={videoRef}
        muted={muted}
        playsInline
        autoPlay={autoPlay}
        style={{ width: "100%", height: "100%", backgroundColor: "#000" }}
      />
    </View>
  );
};

export default NeighborhoodLiveStreamPlayer; // 🎯 FIX FOR EXPORT ERROR

const styles = StyleSheet.create({
  container: { width: "100%", height: "100%", backgroundColor: "#000" },
});