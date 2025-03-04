import React, { useEffect, useState } from "react";
async function fetchVideos() {
  try {
    const response = await fetch(
      "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/api/videos"
    );
    const videos = await response.json();
    return videos;
  } catch (error) {
    console.error("Error fetching videos:", error);
    return [];
  }
}

function VideoGallery() {
  const [videos, setVideos] = useState([]);

  useEffect(() => {
    async function loadVideos() {
      const fetchedVideos = await fetchVideos();
      setVideos(fetchedVideos);
    }
    loadVideos();
  }, []);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
      {videos.map((video) => (
        <div
          key={video._id}
          style={{ width: "300px", border: "1px solid #ccc", padding: "10px" }}
        >
          <h3>{video.title}</h3>
          <p>Uploaded by: {video.user.username}</p>
          <p>{video.description || "No description"}</p>
          <button onClick={() => playVideo(video)}>Play</button>
        </div>
      ))}
    </div>
  );
}

export default VideoGallery;
