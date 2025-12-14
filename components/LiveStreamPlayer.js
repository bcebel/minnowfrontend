// LiveStreamPlayer.js (Conceptual Component)

import React, { useEffect, useRef } from "react";

const LiveStreamPlayer = ({ magnetLink }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    // Check for WebTorrent (it was loaded in the streamer component, but ensure it's here too)
    if (!window.WebTorrent) {
      // In a real app, you'd load the script here or ensure it's bundled
      console.warn("WebTorrent is not available to play stream.");
      return;
    }

    const client = new window.WebTorrent();

    // Add the magnet link
    client.add(magnetLink, (torrent) => {
      console.log(
        "✅ Client is downloading/peering with stream:",
        torrent.infoHash
      );

      torrent.on("wire", (wire) => {
        console.log(`Connected to new peer: ${wire.remoteAddress}`);
      });

      // Get the file (should be the video file)
      const file = torrent.files.find((f) => f.name.endsWith(".webm"));

      if (file) {
        file.renderTo(
          videoRef.current,
          {
            autoplay: true,
            controls: true,
            muted: true, // Muting helps with browser autoplay policies
          },
          (err, elem) => {
            if (err) console.error("Error rendering video:", err);
            else console.log("Video rendered successfully.");
          }
        );
      } else {
        console.error("Could not find video file in torrent.");
      }
    });

    // Cleanup function
    return () => {
      client.destroy(() => {
        console.log("Client destroyed.");
      });
    };
  }, [magnetLink]); // Re-run if the magnetLink changes

  return (
    <div style={{ width: "100%", maxWidth: "400px", margin: "15px 0" }}>
      <video
        ref={videoRef}
        style={{ width: "100%", borderRadius: "8px" }}
      ></video>
      <small style={{ color: "#888" }}>
        Powered by WebTorrent P2P technology
      </small>
    </div>
  );
};

export default LiveStreamPlayer;
