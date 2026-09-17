import { useEffect } from "react";
import idbChunkStore from "@thaunknown/idb-chunk-store";
import webtorrentService from "../utils/webtorrentService";

export default function StoreTest() {
  useEffect(() => {
    (async () => {
      console.log("STORE TEST: effect fired");
      const client = await webtorrentService.ensureClient();
      console.log("STORE TEST: client = ready");

      const testMagnet =
        "magnet:?xt=urn:btih:90d5fd93102cdcfb38ab18ef80a0098cd3601d9e&dn=post_1789509534073.mp4&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.dev";
      
      

const existing = await client.get(testMagnet);
if (existing) {
  console.log("STORE TEST: removing existing torrent");
  await client.remove(existing.infoHash);
}

      console.log("STORE TEST: adding torrent with IDB store");
   const torrent = client.add(testMagnet, {
     store: idbChunkStore,
     storeOpts: { name: "test-sintel" },
     announce: window.enhancedTrackers || [
       "wss://tracker.openwebtorrent.com",
       "wss://tracker.webtorrent.dev",
       "wss://tracker-0ad4cca9fd92.herokuapp.com",
     ],
   });

      torrent.on("download", () => {
        console.log("progress:", (torrent.progress * 100).toFixed(1) + "%");
      });

      torrent.on("done", () => {
        console.log("STORE TEST: torrent done, chunks in IDB");
      });

      torrent.on("error", (err) => {
        console.error("STORE TEST: torrent error", err);
      });
    })();
  }, []);

  return null;
}
