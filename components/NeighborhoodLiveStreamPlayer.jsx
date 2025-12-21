// NeighborhoodLiveStreamPlayer.jsx - USING GLOBAL WEBTORRENT
import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Platform } from "react-native";

export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  initialChunks = [],
  clearProcessedChunk,
}) {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processedChunks, setProcessedChunks] = useState(new Set());
  const [chunkLog, setChunkLog] = useState([]);

  // Add to debug log
  const addLog = (message) => {
    const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
    setChunkLog((prev) => [...prev.slice(-20), `${timestamp}: ${message}`]);
    console.log(`[Player ${sessionId}] ${message}`);
  };

  // Sort chunks by index
  const sortedChunks = [...initialChunks].sort(
    (a, b) => a.chunkIndex - b.chunkIndex
  );

  useEffect(() => {
    console.log("WebTorrent available?", {
      windowWebTorrent: !!window.WebTorrent,
      globalClient: !!window.globalWebTorrentClient,
      windowType: typeof window,
    });
  }, []);
  // 1. SETUP MEDIASOURCE AND VIDEO ELEMENT

useEffect(() => {
  if (typeof window === "undefined") return;

  addLog(`Setting up player`);

  // Cleanup any existing
  if (videoRef.current) {
    videoRef.current.pause();
    videoRef.current.remove();
  }
  // 1. Function to GET THE CONSTRUCTOR
  function getMediaSourceConstructor() {
    // Prioritize ManagedMediaSource for iOS Safari 17.1+
    if (self.ManagedMediaSource) {
      addLog("Using ManagedMediaSource API");
      return self.ManagedMediaSource;
    }
    // Fallback to standard MediaSource for Chrome, Firefox, etc.
    if (self.MediaSource) {
      addLog("Using standard MediaSource API");
      return self.MediaSource;
    }
    // If neither exists, throw an error
    throw new Error("No MediaSource API is available in this browser.");
  }

  // 2. GET THE CONSTRUCTOR and CREATE A NEW INSTANCE
  const MediaSourceConstructor = getMediaSourceConstructor();
  const mediaSource = new MediaSourceConstructor(); // <-- The 'new' keyword is essential

  mediaSourceRef.current = mediaSource;

  // Create video element
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = true;
  video.muted = true; // REQUIRED for autoplay
  video.style.width = "100%";
  video.style.height = "auto";
  video.playsInline = true;
  video.preload = "auto";

  // Set video source
  const url = URL.createObjectURL(mediaSource);
  video.src = url;

  // Add event listeners for debugging
  video.addEventListener("playing", () => {
    addLog(`VIDEO IS PLAYING!`);
    setIsLoading(false);
  });

  video.addEventListener("loadeddata", () => {
    addLog(`Video loaded data`);
  });

  video.addEventListener("canplay", () => {
    addLog(`Video can play`);
    video.play().catch((e) => {
      addLog(`Play error: ${e.message}`);
    });
  });

  video.addEventListener("error", (e) => {
    addLog(`Video error: ${e.target.error?.code || "Unknown"}`);
    setError(
      `Video error ${e.target.error?.code}: ${
        e.target.error?.message || "Unknown"
      }`
    );
  });

  video.addEventListener("waiting", () => {
    addLog(`Video waiting for data`);
  });

  // Add to DOM
  const container = document.getElementById(`video-container-${sessionId}`);
  if (container) {
    container.innerHTML = "";
    container.appendChild(video);
    videoRef.current = video;
  }

  // MediaSource event handlers
  const handleSourceOpen = () => {
    addLog(`MediaSource opened`);
    try {
      // Try different MIME types - your logs show .webm files
      const mimeTypes = [
        'video/webm; codecs="vp8,opus"',
        'video/webm; codecs="vp9,opus"',
        'video/webm; codecs="vp8,vorbis"',
        'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
      ];

      let sourceBuffer = null;
      for (const mimeType of mimeTypes) {
        try {
          sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          addLog(`Created SourceBuffer with ${mimeType}`);
          break;
        } catch (e) {
          addLog(
            `Failed to create SourceBuffer with ${mimeType}: ${e.message}`
          );
        }
      }

      if (!sourceBuffer) {
        setError("Browser does not support required video format");
        return;
      }

      sourceBufferRef.current = sourceBuffer;
      sourceBuffer.mode = "sequence"; // IMPORTANT for live streaming

      sourceBuffer.addEventListener("updateend", () => {
        addLog(`SourceBuffer update ended`);
      });

      sourceBuffer.addEventListener("error", (e) => {
        addLog(`SourceBuffer error: ${e.message}`);
      });

      // Start processing chunks
      if (sortedChunks.length > 0) {
        addLog(`Processing ${sortedChunks.length} chunks`);
        processNextChunk();
      }
    } catch (e) {
      addLog(`Failed to setup SourceBuffer: ${e.message}`);
      setError(`Failed to setup video: ${e.message}`);
    }
  };

  mediaSource.addEventListener("sourceopen", handleSourceOpen);

  mediaSource.addEventListener("sourceended", () => {
    addLog(`MediaSource ended`);
  });

  mediaSource.addEventListener("sourceclose", () => {
    addLog(`MediaSource closed`);
  });

  // Cleanup function
  return () => {
    addLog(`Cleaning up player`);

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.remove();
      videoRef.current = null;
    }

    if (mediaSourceRef.current) {
      mediaSourceRef.current.removeEventListener(
        "sourceopen",
        handleSourceOpen
      );
      mediaSourceRef.current = null;
    }

    if (url) {
      URL.revokeObjectURL(url);
    }

    sourceBufferRef.current = null;
  };
}, [sessionId]); // Only re-run if sessionId changes

  useEffect(() => {
    if (!sortedChunks.length || !window.globalWebTorrentClient) {
      return;
    }

    const magnetUri = sortedChunks[0].magnetLink;
    if (!magnetUri) return;

    console.log(`[Swarm ${sessionId}] Joining...`);

    // Store the torrent reference in a ref so cleanup can access it
    const torrentRef = { current: null };

    window.globalWebTorrentClient.add(magnetUri, (torrent) => {
      torrentRef.current = torrent;
      console.log(`[Swarm ${sessionId}] Joined! Peers: ${torrent.numPeers}`);
    });

    // Return cleanup function
    return () => {
      console.log(`[Swarm ${sessionId}] Attempting cleanup...`);

      // Wait a tick to ensure the torrent was actually added
      setTimeout(() => {
        if (window.globalWebTorrentClient && torrentRef.current) {
          try {
            // Check if torrent still exists in client
            const exists = window.globalWebTorrentClient.torrents.some(
              (t) => t.infoHash === torrentRef.current.infoHash
            );

            if (exists) {
              console.log(`[Swarm ${sessionId}] Removing torrent...`);
              window.globalWebTorrentClient.remove(torrentRef.current);
            }
          } catch (err) {
            console.warn(`[Swarm ${sessionId}] Cleanup warning:`, err.message);
          }
        }
      }, 0);
    };
  }, [sortedChunks, sessionId]);
  
  useEffect(() => {
    if (sortedChunks.length > 0 && sourceBufferRef.current) {
      console.log(
        `Triggering processNextChunk because we have ${sortedChunks.length} chunks and SourceBuffer is ready`
      );
      processNextChunk();
    }
  }, [sortedChunks.length, sourceBufferRef.current]);
  // 2. PROCESS CHUNKS ONE BY ONE USING GLOBAL WEBTORRENT
  const processNextChunk = () => {
    if (!sourceBufferRef.current || sourceBufferRef.current.updating) {
      addLog(`SourceBuffer busy, will retry`);
      setTimeout(processNextChunk, 100);
      return;
    }

    // Find the next unprocessed chunk
    const nextChunk = sortedChunks.find(
      (chunk) =>
        !processedChunks.has(chunk.id) &&
        chunk.chunkIndex === processedChunks.size
    );

    if (!nextChunk) {
      addLog(`No chunks to process or waiting for next in sequence`);
      setIsLoading(processedChunks.size === 0);
      return;
    }

    addLog(`Downloading chunk ${nextChunk.chunkIndex}`);

    // Check if WebTorrent is available globally
    if (!window.WebTorrent && !window.globalWebTorrentClient) {
      addLog(`ERROR: WebTorrent not available globally`);
      setError("WebTorrent not loaded. Please refresh the page.");
      return;
    }

    // Use global WebTorrent client if available, otherwise create a new one
    const client = window.globalWebTorrentClient || new window.WebTorrent();

    client.add(nextChunk.magnetLink, (torrent) => {
      addLog(
        `Torrent added for chunk ${nextChunk.chunkIndex}, files: ${torrent.files.length}`
      );

      const file = torrent.files[0];
      if (!file) {
        addLog(`ERROR: No file in torrent for chunk ${nextChunk.chunkIndex}`);
        return;
      }

      file.getBuffer((err, buffer) => {
        if (err) {
          addLog(
            `ERROR getting buffer for chunk ${nextChunk.chunkIndex}: ${err.message}`
          );
          return;
        }

        addLog(
          `Got buffer for chunk ${nextChunk.chunkIndex}, size: ${buffer.byteLength} bytes`
        );

        // Append to SourceBuffer
        try {
          if (sourceBufferRef.current && !sourceBufferRef.current.updating) {
            sourceBufferRef.current.appendBuffer(buffer);
            addLog(`Appended chunk ${nextChunk.chunkIndex} to SourceBuffer`);

            // Mark as processed
            setProcessedChunks((prev) => new Set(prev).add(nextChunk.id));

            // Notify parent
            if (clearProcessedChunk) {
              clearProcessedChunk(nextChunk.id);
            }

            // Try to play if this is the first chunk
            if (processedChunks.size === 0 && videoRef.current) {
              addLog(`First chunk appended, trying to play`);
              videoRef.current.play().catch((e) => {
                addLog(`Autoplay failed: ${e.message}`);
              });
            }
          } else {
            addLog(`SourceBuffer not ready, retrying in 100ms`);
            setTimeout(() => {
              try {
                if (
                  sourceBufferRef.current &&
                  !sourceBufferRef.current.updating
                ) {
                  sourceBufferRef.current.appendBuffer(buffer);
                }
              } catch (e) {
                addLog(`Retry append failed: ${e.message}`);
              }
            }, 100);
          }
        } catch (e) {
          addLog(`Failed to append buffer: ${e.message}`);
        }

        // Don't destroy the client if it's the global one
        if (client !== window.globalWebTorrentClient) {
          client.destroy();
        }
      });
    });

    client.on("error", (err) => {
      addLog(
        `WebTorrent error for chunk ${nextChunk.chunkIndex}: ${err.message}`
      );
    });
  };

  // 3. PROCESS CHUNKS WHEN THEY ARRIVE
  useEffect(() => {
    if (
      sortedChunks.length > 0 &&
      sourceBufferRef.current &&
      typeof window !== "undefined"
    ) {
      addLog(`New chunks arrived, processing next`);
      processNextChunk();
    }
  }, [sortedChunks.length, processedChunks.size]);

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#00ffff" />
          <Text style={styles.loadingText}>
            {processedChunks.size === 0
              ? "Loading first chunk..."
              : "Buffering..."}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Video container */}
      <View id={`video-container-${sessionId}`} style={styles.videoContainer} />

      <View style={styles.statsContainer}>
        <Text style={styles.sessionId}>Session: {sessionId}</Text>
        <Text style={styles.chunkInfo}>
          Chunks: {processedChunks.size}/{sortedChunks.length} processed
        </Text>
        {sortedChunks.length > 0 && (
          <Text style={styles.chunkInfo}>
            Next: #
            {sortedChunks.find((c) => !processedChunks.has(c.id))?.chunkIndex ||
              "none"}
          </Text>
        )}
      </View>

      {/* Debug log */}
      {chunkLog.length > 0 && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugTitle}>Debug Log:</Text>
          {chunkLog.slice(-5).map((log, i) => (
            <Text key={i} style={styles.debugText} numberOfLines={1}>
              {log}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    backgroundColor: "#111",
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  loadingContainer: {
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    color: "#fff",
    marginTop: 10,
  },
  errorContainer: {
    backgroundColor: "#ff4444",
    padding: 10,
    borderRadius: 5,
    marginBottom: 10,
  },
  errorText: {
    color: "white",
    textAlign: "center",
  },
  videoContainer: {
    width: "100%",
    minHeight: 300,
    backgroundColor: "#000",
    borderRadius: 5,
    overflow: "hidden",
     borderWidth: 1,
      borderColor: 'transparent',
  },
  statsContainer: {
    marginTop: 10,
    padding: 5,
    backgroundColor: "#222",
    borderRadius: 5,
  },
  sessionId: {
    color: "#888",
    fontSize: 12,
    fontFamily: "monospace",
  },
  chunkInfo: {
    color: "#0f0",
    fontSize: 12,
    marginTop: 2,
    fontFamily: "monospace",
  },
  debugContainer: {
    marginTop: 10,
    padding: 5,
    backgroundColor: "#000",
    borderRadius: 5,
    maxHeight: 100,
  },
  debugTitle: {
    color: "#ff0",
    fontSize: 12,
    fontFamily: "monospace",
    marginBottom: 2,
  },
  debugText: {
    color: "#0ff",
    fontSize: 10,
    fontFamily: "monospace",
  },
});
