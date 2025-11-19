// app/homebase.tsx
import { View, Text } from "react-native";
import StaticWebTorrentPlayer from "../components/StaticWebTorrentPlayer";

export default function HomeBase() {
  const personalVideos = [
    // Your personal content that you always want to seed
    {
      fileName: "family-vacation.mp4",
      magnetLink: "magnet:?xt=urn:btih:...",
      cid: "...",
    },
    {
      fileName: "birthday-party.mov",
      magnetLink: "magnet:?xt=urn:btih:...",
      cid: "...",
    },
  ];

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, color: "white", marginBottom: 20 }}>
        🏠 My Home Base
      </Text>
      <Text style={{ color: "#888", marginBottom: 20 }}>
        This page is always seeding my personal content to the P2P network
      </Text>

      {personalVideos.map((video, index) => (
        <StaticWebTorrentPlayer key={index} video={video} />
      ))}
    </View>
  );
}
