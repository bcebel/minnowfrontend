import React, { useRef, useEffect, useState, useCallback } from "react";

const NeighborhoodLiveStreamPlayer = ({
  sessionId,
  initialChunks = [],
  clearProcessedChunk,
}) => {
  const videoRef = useRef(null);
  const mediaSourceRef = useRef(null);
  const sourceBufferRef = useRef(null);
  const nextChunkIndexRef = useRef(0);

  const [status, setStatus] = useState("Waiting for stream to start...");
  const [peerCount, setPeerCount] = useState(0);

  // Correctly use useState for the chunk queue to ensure re-renders
  const [chunkQueue, setChunkQueue] = useState([]);

  const getClient = useCallback(() => {
    if (typeof window !== "undefined" && window.globalWebTorrentClient) {
      return window.globalWebTorrentClient;
    }
    return null;
  }, []);

  const processChunkQueue = useCallback(() => {
    const client = getClient();
    const sourceBuffer = sourceBufferRef.current;
    if (!client || !sourceBuffer || sourceBuffer.updating) {
      return;
    }
    
    const nextChunk = chunkQueue.find(
      (c) => c.chunkIndex === nextChunkIndexRef.current
    );

    if (!nextChunk) {
      setStatus("Waiting for next chunk message...");
      console.log(`[Player] Waiting for chunk #${nextChunkIndexRef.current}, but it's not in the queue.`);
      return;
    }

    // Remove the chunk from the queue
    setChunkQueue(prevQueue => prevQueue.filter(c => c.id !== nextChunk.id));
    setStatus(`Downloading Chunk #${nextChunk.chunkIndex + 1}...`);
    console.log(`[Player] Processing chunk #${nextChunk.chunkIndex}`);

    client.add(nextChunk.magnetLink, { strategy: 'sequential', live: true }, (torrent) => {
      console.log(`[Player] Torrent added for chunk #${nextChunk.chunkIndex}`);
      torrent.on('wire', () => setPeerCount(torrent.numPeers));
      torrent.on('done', () => {
        file.getBuffer((err, buffer) => {
          torrent.destroy();
          if (err || !buffer) {
            console.error("Error downloading chunk buffer:", err);
            return;
          }
          try {
            sourceBuffer.appendBuffer(buffer);
            nextChunkIndexRef.current += 1;
            setStatus(`Playing Chunk #${nextChunkIndexRef.current}`);
            clearProcessedChunk(nextChunk.id);
          } catch (e) {
            console.error("Error appending buffer:", e);
            setStatus(`Error playing chunk: ${e.message}`);
          }
        });
      });
      const file = torrent.files[0];
      if (!file) {
        console.error("No file found in torrent for chunk", nextChunk.chunkIndex);
        return;
      }
    });
  }, [chunkQueue, getClient, clearProcessedChunk]);

  // This ref holds the latest version of the processChunkQueue callback
  const processChunkQueueRef = useRef(processChunkQueue);
  useEffect(() => {
    processChunkQueueRef.current = processChunkQueue;
  }, [processChunkQueue]);

  // Main setup effect, runs only when sessionId changes
  useEffect(() => {
    console.log("Setting up media source for session:", sessionId);
    const MediaSourceClass = window.ManagedMediaSource || window.MediaSource;
    if (!MediaSourceClass) {
      setStatus("MediaSource API not supported.");
      return;
    }

    const mediaSource = new MediaSourceClass();
    mediaSourceRef.current = mediaSource;
    const videoUrl = URL.createObjectURL(mediaSource);
    videoRef.current.src = videoUrl;

    const onSourceOpen = () => {
      if (mediaSource.readyState === 'open') {
        try {
          const mimeType = 'video/webm;codecs=vp8,opus';
          if (!MediaSourceClass.isTypeSupported(mimeType)) {
            setStatus("Video format not supported.");
            return;
          }
          const sourceBuffer = mediaSource.addSourceBuffer(mimeType);
          const updateEndHandler = () => processChunkQueueRef.current();
          sourceBuffer.addEventListener("updateend", updateEndHandler);
          
          sourceBufferRef.current = sourceBuffer;
          sourceBufferRef.current.cleanup = () => sourceBuffer.removeEventListener("updateend", updateEndHandler);

          processChunkQueueRef.current();
        } catch (e) {
          console.error("Error adding source buffer:", e);
        }
      }
    };

    mediaSource.addEventListener("sourceopen", onSourceOpen);

    return () => {
      console.log("Cleaning up media source for session:", sessionId);
      mediaSource.removeEventListener("sourceopen", onSourceOpen);
      if (sourceBufferRef.current?.cleanup) {
        sourceBufferRef.current.cleanup();
      }
      const client = getClient();
      if (client) {
        client.torrents.forEach((t) => {
          if (t.name.includes(sessionId)) t.destroy();
        });
      }
    };
  }, [sessionId, getClient]);

  // Effect to handle incoming chunks from the parent
  useEffect(() => {
    console.log(`[Player] Received ${initialChunks.length} initialChunks from parent.`);
    console.log('[Player] Full initialChunks array:', JSON.stringify(initialChunks.map(c => ({id: c.id, chunkIndex: c.chunkIndex, fileType: c.fileType}))));
    
    setChunkQueue(prevQueue => {
      const newChunks = [];
      initialChunks.forEach(chunk => {
        if (chunk.fileType === 'video_chunk' && !prevQueue.some(q => q.id === chunk.id)) {
          newChunks.push(chunk);
        }
      });
      
      if (newChunks.length > 0) {
        const combined = [...prevQueue, ...newChunks];
        combined.sort((a, b) => a.chunkIndex - b.chunkIndex);
        return combined;
      }
      return prevQueue;
    });
  }, [initialChunks]);

  // Effect to trigger processing when the internal queue is updated
  useEffect(() => {
    console.log(`[Player] Queue updated. Current indices: [${chunkQueue.map(c => c.chunkIndex).join(', ')}]. Triggering processing.`);
    processChunkQueueRef.current();
  }, [chunkQueue]);

  return (
    <div style={{ padding: 10, backgroundColor: "black", borderRadius: 8 }}>
      <video
        ref={videoRef}
        controls
        autoPlay
        playsInline
        muted
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