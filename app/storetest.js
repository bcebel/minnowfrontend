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
        "magnet:?xt=urn:btih:8fcfe3a0dca103fdc1fb1e5b8381d5a9b6fbfd78&dn=livestream-video-QmcP2T3ENoQ4kdXJdGKSXHp66NugzEubp6wKF2t6PhaJq8-1789677892607&tr=wss%3A%2F%2Ftracker-0ad4cca9fd92.herokuapp.com&tr=wss%3A%2F%2Ftracker.files.fm%3A7073%2Fannounce&tr=wss%3A%2F%2Ftracker.webtorrent.dev&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.files.fm%3A7073&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337%2Fannounce&tr=udp%3A%2F%2Fopen.tracker.cl%3A1337%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337%2Fannounce&tr=udp%3A%2F%2Fexodus.desync.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.moeking.me%3A6969%2Fannounce&tr=udp%3A%2F%2Fopentor.org%3A2710%2Fannounce&tr=udp%3A%2F%2Ftracker.cyberia.is%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker3.itzmx.com%3A6961%2Fannounce&ws=https%3A%2F%2Ffuchsia-solid-parrot-571.mypinata.cloud%2Fipfs%2FQmcP2T3ENoQ4kdXJdGKSXHp66NugzEubp6wKF2t6PhaJq8";
      
      

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
      
      torrent.on("ready", () => {
        console.log(
          "STORE TEST: ready. done:",
          torrent.done,
          "progress:",
          torrent.progress,
        );
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
