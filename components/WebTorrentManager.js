import React, { useEffect } from "react";

const WebTorrentManager = () => {
  useEffect(() => {
    // Initialize global WebTorrent client once
    const initWebTorrent = async () => {
      if (typeof window === "undefined") return;

      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);

        await new Promise((resolve) => {
          script.onload = resolve;
        });
      }

      // Create single global client
      if (!window.globalWebTorrentClient) {
        window.globalWebTorrentClient = new window.WebTorrent({
          tracker: {
            pex: true,
            lsd: true,
          },
          dht: true,
        });

        console.log("🌐 Global WebTorrent client initialized");

        // Set default trackers
        window.enhancedTrackers = [
          "wss://tracker.openwebtorrent.com",
          "wss://tracker.btorrent.xyz",
          "wss://tracker.files.fm:7073/announce",
        ];
      }
    };

    initWebTorrent();

    return () => {
      // Don't destroy the client - keep it alive for seeding
      console.log("🔄 WebTorrentManager unmounting (keeping client alive)");
    };
  }, []);

  return null; // This is a headless component
};

export const webtorrentManager = {
  getClient: () => window.globalWebTorrentClient,

  seedChunks: async (chunkFiles, sessionId) => {
    const client = window.globalWebTorrentClient;
    if (!client) throw new Error("WebTorrent client not initialized");

    return new Promise((resolve, reject) => {
      client.seed(
        chunkFiles,
        {
          name: `${sessionId}_multistream`,
          announce: window.enhancedTrackers,
        },
        (torrent) => {
          console.log("✅ Chunks seeded:", torrent.magnetURI);
          resolve(torrent.magnetURI);
        }
      );

      client.on("error", reject);
    });
  },

  getStats: () => {
    const client = window.globalWebTorrentClient;
    if (!client) return { activeTorrents: 0, totalPeers: 0 };

    return {
      activeTorrents: client.torrents.length,
      totalPeers: client.torrents.reduce((sum, t) => sum + t.numPeers, 0),
    };
  },
};

export default WebTorrentManager;
