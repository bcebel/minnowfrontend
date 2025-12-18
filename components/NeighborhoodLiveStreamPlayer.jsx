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
    // 1. Check for player/client readiness
    const client = getClient();
    const sourceBuffer = sourceBufferRef.current;
    if (!client || !sourceBuffer || sourceBuffer.updating) {
      // If the buffer is busy, just wait for the 'updateend' listener to call this function again.
      // If the client isn't ready, the useEffect will call us back.
      return;
    }

    
    // 2. Find the next sequential chunk we need
    const nextChunk = chunkQueueRef.current.find(
      (c) => c.chunkIndex === nextChunkIndexRef.current
    );

    if (!nextChunk) {
      // Waiting for the next chunk message from the server
      setStatus("Waiting for next chunk message...");
      return;
    }

    // 3. Remove the chunk from the queue (we're processing it now)
    chunkQueueRef.current = chunkQueueRef.current.filter(
      (c) => c.chunkIndex !== nextChunk.chunkIndex
    );
    setStatus(`Downloading Chunk #${nextChunk.chunkIndex + 1}...`);

    // 4. Download and Append
    client.add(nextChunk.magnetLink, (torrent) => {
      const file = torrent.files[0];

      // Use the 'done' event, not just 'wire' or 'add'
      torrent.on("done", () => {
        file.getBuffer((err, buffer) => {
          torrent.destroy(); // Clean up torrent immediately after download

          if (err || !buffer) {
            console.error("Error downloading chunk buffer:", err);
            setStatus(`Error downloading chunk #${nextChunk.chunkIndex + 1}`);
            return;
          }

          // 5. Append the Buffer
          sourceBuffer.appendBuffer(buffer);

          // Success! Move to the next index. The persistent 'updateend' listener will call processChunkQueue()
          nextChunkIndexRef.current += 1;
          setStatus(`Playing Chunk #${nextChunkIndexRef.current}`);
          clearProcessedChunk(nextChunk.id); // Notify parent (chat)
        });
      });
      // Add error/peer listeners here for debugging
      torrent.on("error", (err) =>
        console.error(`❌ Torrent failed for ${nextChunk.chunkIndex}:`, err)
      );
      torrent.on("wire", () => setPeerCount((c) => c + 1));
    });
  }, [sessionId, clearProcessedChunk, getClient]);

  // 2. Initial Setup (MediaSource/Video)
  useEffect(() => {
    // MediaSource is only for Web, with a check for Apple's ManagedMediaSource
    if (typeof window === "undefined" || !videoRef.current) return;

    const MediaSourceClass = window.ManagedMediaSource || window.MediaSource;

    if (!MediaSourceClass) {
      setStatus("MediaSource API not supported.");
      return;
    }

    const mediaSource = new MediaSourceClass();
    mediaSourceRef.current = mediaSource;
    videoRef.current.src = URL.createObjectURL(mediaSource);

    const onSourceOpen = () => {
      console.log("MediaSource is open, creating SourceBuffer...");
      // Now that the source is open, we can add the buffer.
      const potentialMimeTypes = [
        'video/webm;codecs=vp8,opus',
        'video/webm; codecs="vp8, opus"',
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        "video/webm",
      ];
      const supportedMimeType = potentialMimeTypes.find((t) =>
        MediaSourceClass.isTypeSupported(t)
      );

      if (supportedMimeType && mediaSource.readyState === 'open') {
        try {
          const sourceBuffer = mediaSource.addSourceBuffer(supportedMimeType);
          sourceBuffer.addEventListener("updateend", processChunkQueue);
          sourceBufferRef.current = sourceBuffer;
          // Now that the buffer is ready, process any chunks that have already arrived.
          processChunkQueue();
        } catch (e) {
          console.error("Error adding source buffer:", e);
          setStatus("Error setting up video buffer.");
        }
      } else {
        setStatus("No supported stream format found!");
      }
    };

    mediaSource.addEventListener("sourceopen", onSourceOpen);

    // Cleanup function
    return () => {
      mediaSource.removeEventListener("sourceopen", onSourceOpen);
      if (sourceBufferRef.current) {
        sourceBufferRef.current.removeEventListener("updateend", processChunkQueue);
      }
      // Destroy all related torrents when the component unmounts
      const client = window.globalWebTorrentClient;
      client?.torrents.forEach((t) => {
        if (t.name.includes(sessionId)) {
          t.destroy();
        }
      });
    };
  }, [sessionId, clearProcessedChunk, getClient, processChunkQueue]);

  // 3. Handle Incoming Chunks
  // 3. Handle Incoming Chunks (NeighborhoodLiveStreamPlayer.jsx)
  useEffect(() => {
    if (initialChunks.length > 0) {
      initialChunks.forEach((chunk) => {
        // 🔑 1. Filter: Only process video chunks for this stream's session
        if (chunk.fileType === "video_chunk") {
          // 🔑 2. Uniqueness Check: Only add it if it's not already in the queue
          if (
            !chunkQueueRef.current.find(
              (c) => c.chunkIndex === chunk.chunkIndex
            )
          ) {
            chunkQueueRef.current.push(chunk);
          }
        }
      });

      // 3. Sort: Ensure the queue is sequential (0, 1, 2, ...)
      chunkQueueRef.current.sort((a, b) => a.chunkIndex - b.chunkIndex);

      // 4. Trigger processing whenever new chunks arrive
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
