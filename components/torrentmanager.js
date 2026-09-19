// torrentManager.js
import idbChunkStore from "@thaunknown/idb-chunk-store";
import { getMedia, saveMedia } from "../components/mediaCache";
import { webtorrentService } from "../utils/webtorrentService"
// Global WebTorrent client instance
let client = null;
const activeDownloads = new Map(); // Magnet/CID -> { torrent, blobUrl, status }
// torrentManager.js
const MAX_ACTIVE_TORRENTS = 15;

if (activeDownloads.size >= MAX_ACTIVE_TORRENTS) {
  const oldestCid = activeDownloads.keys().next().value;
  const item = activeDownloads.get(oldestCid);

  if (item?.torrent) {
    client.remove(item.torrent.infoHash); // Releases WebRTC connections
  }
  if (item?.blobUrl) {
    URL.revokeObjectURL(item.blobUrl); // Frees browser RAM
  }
  activeDownloads.delete(oldestCid);
}

export const getOrStartTorrent = async (magnetLink, cid) => {
  if (!client) {
    const WebTorrent = window.WebTorrent;
    client = new WebTorrent();
  }

  // 1. Return immediately if already cached in-memory
  if (activeDownloads.has(cid)) {
    return activeDownloads.get(cid);
  }

  // 2. Check if client already knows about this magnet
let torrent = await client.get(magnetLink);
if (!torrent) {
  torrent = await client.add(magnetLink, {
    store: idbChunkStore,
    storeOpts: { name: `media-${cid}` },
    announce: webtorrentService.trackers,
    strategy: media.fileType === "image" ? "rarest" : "sequential",
  });
}


  const record = { torrent, blobUrl: null, isDone: false };
  activeDownloads.set(cid, record);

  // 3. Handle chunk assembly without dying on React unmount
  torrent.on("done", async () => {
    try {
      const file = torrent.files[0];
      const blob = await file.blob();
      record.blobUrl = URL.createObjectURL(blob);
      record.isDone = true;
    } catch (err) {
      console.error("Failed to generate blob:", err);
    }
  });

  return record;
};

export const getMediaWithFallback = async (media, onStatusChange) => {
  const { magnetLink, cid, ipfsUrl, fallbackUrl } = media;
  const httpUrl =
    ipfsUrl || fallbackUrl || `https://gateway.pinata.cloud/ipfs/${cid}`;

  // 1. Check IndexedDB first (Fastest path)
  try {
    const cached = await getMedia(cid); // <--- Requires the getMedia import above!
    if (cached?.blob) {
      onStatusChange?.("cached");
      return { url: URL.createObjectURL(cached.blob), source: "cache" };
    }
  } catch (err) {
    console.log("Cache miss, proceeding to network:", err);
  }

  // 2. If no magnet link, return HTTP URL directly
  if (!magnetLink) {
    onStatusChange?.("fallback_http");
    return { url: httpUrl, source: "http" };
  }

  // 3. Race P2P against 4-second HTTP Fallback Timer
  return new Promise(async (resolve) => {
    let resolved = false;

    const fallbackTimer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        onStatusChange?.("fallback_http");
        resolve({ url: httpUrl, source: "http_fallback" });
      }
    }, 4000);

    try {
      onStatusChange?.("connecting_p2p");
      const record = await getOrStartTorrent(magnetLink, cid);

      const checkProgress = () => {
        if (!resolved && (record.torrent.progress > 0 || record.isDone)) {
          resolved = true;
          clearTimeout(fallbackTimer);
          onStatusChange?.("p2p_streaming");
          resolve({
            url:
              record.blobUrl ||
              (record.torrent.files[0]
                ? URL.createObjectURL(record.torrent.files[0])
                : httpUrl),
            source: "p2p",
            torrent: record.torrent,
          });
        }
      };

      if (record.isDone || record.torrent.progress > 0) {
        checkProgress();
      } else {
        record.torrent.on("download", checkProgress);
        record.torrent.on("done", checkProgress);
      }
    } catch (err) {
      if (!resolved) {
        resolved = true;
        clearTimeout(fallbackTimer);
        onStatusChange?.("fallback_http");
        resolve({ url: httpUrl, source: "http_fallback" });
      }
    }
  });
};
