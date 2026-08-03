import React from "react";
import { useLocalSearchParams } from "expo-router";
import PostFeed from "./PostFeed";

export default function NeighborhoodGalleryScreen() {
  const params = useLocalSearchParams();
  const neighborhoodId = params.neighborhoodId as string;

  return <PostFeed neighborhoodId={neighborhoodId} />;
}
