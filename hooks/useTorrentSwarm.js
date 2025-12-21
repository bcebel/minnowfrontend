// hooks/useTorrentSwarm.js
import { useState, useEffect, useRef } from "react";

export default function useTorrentSwarm(magnetUri, sessionId) {
  const [torrent, setTorrent] = useState(null);
  const [peers, setPeers] = useState(0);
  const [error, setError] = useState(null);
  const torrentRef = useRef(null);

  useEffect(() => {
    if (!magnetUri || !window.globalWebTorrentClient) return;

    console.log(`[SwarmManager ${sessionId}] Managing torrent`);

    // Add the torrent. WebTorrent will return the existing one if it's a duplicate.
    const client = window.globalWebTorrentClient;
    const newTorrent = client.add(magnetUri);

    torrentRef.current = newTorrent;
    setTorrent(newTorrent);

    // Listen for updates
    newTorrent.on("ready", () => {
      console.log(
        `[SwarmManager ${sessionId}] Torrent ready, peers: ${newTorrent.numPeers}`
      );
      setPeers(newTorrent.numPeers);
    });

    newTorrent.on("wire", (peer) => {
      console.log(`[SwarmManager ${sessionId}] Peer connected: ${peer.addr}`);
      setPeers(newTorrent.numPeers);
    });

    newTorrent.on("error", (err) => {
      // Ignore "duplicate torrent" error, it's expected
      if (!err.message.includes("duplicate torrent")) {
        console.error(`[SwarmManager ${sessionId}] Error:`, err.message);
        setError(err.message);
      }
    });

    // Cleanup: DO NOT remove the torrent. Let the global client manage it.
    // The torrent will be garbage collected by WebTorrent when no one needs it.
    return () => {
      console.log(
        `[SwarmManager ${sessionId}] Releasing reference. Global client keeps torrent.`
      );
      torrentRef.current = null;
      setTorrent(null);
    };
  }, [magnetUri, sessionId]);

  return { torrent, peers, error };
}
