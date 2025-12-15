import React, { useRef, useEffect, useState, useCallback } from "react";

const CHUNK_TIMEOUT_MS = 10000;

const NeighborhoodLiveStreamPlayer = ({
  sessionId,
  initialChunks = [],
  clearProcessedChunk,
}) => {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const chunkQueueRef = useRef([]);
  const nextChunkIndexRef = useRef(0);

  const [status, setStatus] = useState("Waiting for stream to start...");
  const [peerCount, setPeerCount] = useState(0);

  // 1. Get the Client Safely
  // DO NOT use "const WebTorrentClient = window.globalWebTorrentClient;" at the top level!
  const getClient = useCallback(() => {
    // This check ensures we only access 'window' when it exists (i.e., in the browser)
    if (typeof window !== "undefined" && window.globalWebTorrentClient) {
      return window.globalWebTorrentClient;
    }
    return null;
  }, []);

  // 2. Download and Append Logic (Updated to use getClient)
  const processChunkQueue = useCallback(() => {
    // ... (Your existing logic) ...

    // Get the global torrent client safely
    const client = getClient();
    if (!client) {
      setStatus("P2P Client Not Ready (Waiting for browser mount).");
      return;
    }

    // Get the next chunk we are waiting for (must be sequential!)
    const nextChunk = chunkQueueRef.current.find(
      (c) => c.chunkIndex === nextChunkIndexRef.current
    );

    if (!nextChunk) {
      // We are waiting for the next sequential chunk to arrive
      return;
    }

    // Remove from local queue and prepare for download
    chunkQueueRef.current = chunkQueueRef.current.filter(
      (c) => c.chunkIndex !== nextChunk.chunkIndex
    );

    setStatus(`Downloading Chunk #${nextChunk.chunkIndex + 1}...`);

    // Add the torrent for this chunk magnet link
    const torrent = client.add(
      nextChunk.magnetLink,
      {
        name: `live-chunk-${nextChunk.chunkIndex}-${sessionId}`,
      },
      (torrent) => {
        // The file should be the first one in the torrent
        const file = torrent.files[0];

        file.getBuffer((err, buffer) => {
          if (err) {
            console.error("Error downloading chunk buffer:", err);
            setStatus(`Error downloading chunk #${nextChunk.chunkIndex + 1}`);
            torrent.destroy();
            return;
          }

          // Append the buffer to the MediaSource
          try {
            sourceBufferRef.current.appendBuffer(buffer);

            sourceBufferRef.current.addEventListener(
              "updateend",
              () => {
                // Success! Move to the next chunk
                nextChunkIndexRef.current += 1;
                setStatus(`Playing Chunk #${nextChunkIndexRef.current}`);
                clearProcessedChunk(nextChunk.id); // Tell parent to clear chunk from liveChunks
                torrent.destroy();
                processChunkQueue(); // Check for the next chunk
              },
              { once: true }
            );
          } catch (e) {
            console.error("MediaSource Append Error:", e);
            setStatus("Stream Reassembly Failed.");
            torrent.destroy();
          }
        });

        

        // Update peer count (optional)
        torrent.on("wire", () => setPeerCount(torrent.numPeers));
      }
    );
  }, [sessionId, clearProcessedChunk, getClient]);

  // 2. Initial Setup (MediaSource/Video)
  useEffect(() => {
    // MediaSource is only for Web
    if (typeof window === "undefined" || !videoRef.current) return;

    mediaSourceRef.current = new MediaSource();
    videoRef.current.src = URL.createObjectURL(mediaSourceRef.current);

    mediaSourceRef.current.addEventListener(
      "sourceopen",
      () => {
        // MIME type must match what your MediaRecorder outputs (e.g., 'video/webm; codecs="vp8"')
       const mimeType = 'video/webm; codecs="vp8, opus"';
        if (!MediaSource.isTypeSupported(mimeType)) {
          setStatus("Browser does not support the stream format!");
          return;
        }

        sourceBufferRef.current =
          mediaSourceRef.current.addSourceBuffer(mimeType);

        // Start processing any chunks that arrived before the player was ready
        processChunkQueue();
      },
      { once: true }
    );

    // Cleanup function
    return () => {
      // Destroy all related torrents when the component unmounts
      const client = window.globalWebTorrentClient;
      client?.torrents.forEach((t) => {
        if (t.name.includes(sessionId)) {
          t.destroy();
        }
      });
    };
  }, [sessionId, processChunkQueue, getClient]);

  // 3. Handle Incoming Chunks
  useEffect(() => {
    // Add all new chunks to the queue
    if (initialChunks.length > 0) {
      initialChunks.forEach((chunk) => {
        if (
          !chunkQueueRef.current.find((c) => c.chunkIndex === chunk.chunkIndex)
        ) {
          chunkQueueRef.current.push(chunk);
        }
      });
      // Sort the queue to ensure we always try for index 0, then 1, etc.
      chunkQueueRef.current.sort((a, b) => a.chunkIndex - b.chunkIndex);

      // Trigger processing whenever new chunks arrive
      processChunkQueue();
    }
  }, [initialChunks, processChunkQueue]);

  return (
    <div style={{ padding: 10, backgroundColor: "black", borderRadius: 8 }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        muted // Start muted to satisfy browser autoplay policy
        style={{ width: "100%", height: "auto", display: "block" }}
      />
      <div style={{ color: "white", fontSize: 12, marginTop: 5 }}>
        Status: **{status}** | Peers: **{peerCount}**
      </div>
      <button onClick={() => videoRef.current?.play()} style={{ marginTop: 5 }}>
        Unmute / Start Playback
      </button>
    </div>
  );
};

export default NeighborhoodLiveStreamPlayer;
