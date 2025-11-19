// utils/neighborhoodContent.js
export const neighborhoodContent = {
  photography: [
    {
      fileName: "Photography Tips Tutorial.mp4",
      magnetLink: "magnet:?xt=urn:btih:...",
      cid: "bafybei...",
    },
  ],
  music: [
    {
      fileName: "Guitar Lesson.mp4",
      magnetLink: "magnet:?xt=urn:btih:...",
      cid: "bafybei...",
    },
  ],
  // Add more neighborhoods...
};

// Helper to get neighborhood IDs for static generation
export async function getNeighborhoodIds() {
  // Return hardcoded IDs for now
  return Object.keys(neighborhoodContent);
}
