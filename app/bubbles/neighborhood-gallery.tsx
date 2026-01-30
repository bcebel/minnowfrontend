import React from "react";
import { useLocalSearchParams } from "expo-router";
import NeighborhoodGallery from "./neighborhoodgallery";

export default function NeighborhoodGalleryScreen() {
  const params = useLocalSearchParams();
  const neighborhoodId = params.neighborhoodId as string;

  return <NeighborhoodGallery neighborhoodId={neighborhoodId} />;
}
