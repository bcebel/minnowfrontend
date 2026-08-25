// app/neighborhoods/staticParams.js
export async function getNeighborhoodIds() {
  // Option 1: Hardcode some IDs for testing
  // return ['photography', 'music', 'art', 'tech'];

  // Option 2: Fetch from your API (if available during build)
  try {
    const response = await fetch("https://your-api.com/bubbles/ids");
    const data = await response.json();
    return data.ids;
  } catch (error) {
    // Fallback to hardcoded IDs
    return ["photography", "music", "art", "tech"];
  }
}

export async function generateStaticParams() {
  const neighborhoodIds = await getNeighborhoodIds();
  return neighborhoodIds.map((id) => ({ id }));
}
