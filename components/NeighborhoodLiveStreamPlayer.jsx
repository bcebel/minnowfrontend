// components/NeighborhoodLiveStreamPlayer.jsx (Conceptual Implementation)

import React, { useRef, useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { gql, useSubscription } from "@apollo/client";

import { NeighborhoodVideoReassembler } from "./NeighborhoodVideoReassembler";

// 1. Apollo Subscription Query
const CHUNK_SUBSCRIPTION = gql`
  subscription OnNewChunk($sessionId: String!) {
    newVideoChunk(sessionId: $sessionId) {
      id
      magnetLink
      chunkIndex
      sessionId
      fileType 
    }
  }
`;

export default function NeighborhoodLiveStreamPlayer({
  sessionId,
  streamTitle,
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Change state to useRef for the object that manages the stream connection
  const reassemblerRef = useRef(null);

  // 2. Use Subscription Hook
  const { data } = useSubscription(CHUNK_SUBSCRIPTION, {
    variables: { sessionId },
    skip: !isPlaying, // Only subscribe when playing
    shouldResubscribe: true,
  });

  // 3. Process new chunk data from subscription
  useEffect(() => {
    // Check if a new chunk message arrived and if the player is active
    if (data?.newVideoChunk && reassemblerRef.current) {
      console.log(`📡 New chunk received: ${data.newVideoChunk.chunkIndex}`);
      // This is the CRUCIAL line: feed the chunk to the reassembler for downloading/buffering
      reassemblerRef.current.appendChunk(data.newVideoChunk);
    }
  }, [data]);

  // 4. Update the startWatching logic
  const startWatching = async () => {
    // ⚠️ CRITICAL: Ensure we are only running on web for this logic
    if (typeof window === "undefined" || Platform.OS !== "web") {
      alert("Live streaming is only supported in web browsers.");
      return;
    }

    setIsLoading(true);

    // Make sure WebTorrent is loaded
    if (!window.WebTorrent) {
      // ... (your existing WebTorrent loading logic) ...
    }

    try {
      // 4a. Create and store the Reassembler instance
      const reassembler = new NeighborhoodVideoReassembler(sessionId);
      reassemblerRef.current = reassembler;

      // 4b. Start the playback process (initializes MSE and UI)
      await reassembler.startLivePlayback(); // This now returns the UI element

      // The stream starts listening for chunks immediately
      setIsPlaying(true);
      setIsLoading(false);
    } catch (error) {
      console.error("❌ Failed to start playback:", error);
      setIsLoading(false);
      alert(`Playback error: ${error.message}`);
    }
  };

  const stopWatching = () => {
    if (reassemblerRef.current) {
      reassemblerRef.current.stopPlayback();
      reassemblerRef.current = null; // Clear reference
    }
    setIsPlaying(false);
  };

  // 5. Add a cleanup effect to stop the stream on unmount
  useEffect(() => {
    return () => {
      stopWatching();
    };
  }, []);

  return (
    <View style={{ marginVertical: 10 }}>
      {/* ... rest of your JSX UI ... */}
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    // ... styles
  },
  title: {
    // ... styles
  },
  videoPlayer: {
    width: "100%",
    height: 300,
    backgroundColor: "black",
  },
  statusBar: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },
  statusText: {
    marginLeft: 10,
    color: "#00ff00",
  },
});
