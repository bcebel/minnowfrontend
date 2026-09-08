import { VideoView, useVideoPlayer } from "expo-video";
import { Platform } from "react-native";

export default function SafeVideo({
  src,
  style,
  muted,
  autoPlay,
  playsInline,
  controls,
}) {
  const player = useVideoPlayer(src, (player) => {
    player.loop = false;
    player.muted = muted ?? false;
    if (autoPlay) player.play();
  });

  if (Platform.OS === "web") {
    return (
      <video
        src={src}
        style={style}
        muted={muted}
        autoPlay={autoPlay}
        playsInline={playsInline}
        controls={controls}
      />
    );
  }

  return (
    <VideoView
      player={player}
      style={style}
      contentFit="contain"
      nativeControls={controls ?? false}
    />
  );
}
