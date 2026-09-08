// app/neighborhoods/bubbles/neighborhood-gallery.tsx
import React from "react";
import { useLocalSearchParams } from "expo-router";
import AllNeighborhoodsGallery from "../../../../components/AllNeighborhoodsGallery";

export default function NeighborhoodGalleryScreen() {
  const params = useLocalSearchParams();
  const neighborhoodId = params.neighborhoodId as string;

  return <AllNeighborhoodsGallery neighborhoodId={neighborhoodId} />;
}
