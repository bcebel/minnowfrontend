class NeighborhoodVideoReassembler {
  constructor(neighborhoodId) {
    this.neighborhoodId = neighborhoodId;
    this.client = new WebTorrent();
    this.chunkTorrents = new Map();
    this.reassembledBlobs = [];
  }

  async watchNeighborhoodVideo(videoSessionId) {
    // 1. Get all chunk magnet links from neighborhood chat
    const chunkMessages = await neighborhoodChat.getMessages({
      type: "video_chunk",
      sessionId: videoSessionId,
    });

    // 2. Download all chunks in parallel via swarming
    const downloadPromises = chunkMessages.map(async (message, index) => {
      return new Promise((resolve) => {
        this.client.add(message.magnet, (torrent) => {
          console.log(`Downloading chunk ${index + 1}/${chunkMessages.length}`);

          torrent.files[0].getBlob((err, blob) => {
            if (err) throw err;

            // Store with original chunk index for proper ordering
            this.chunkTorrents.set(message.chunkIndex, {
              blob,
              torrent,
              index: message.chunkIndex,
            });

            resolve(blob);
          });
        });
      });
    });

    // 3. Wait for all chunks to download
    await Promise.all(downloadPromises);
    console.log("All chunks downloaded!");

    // 4. Reassemble in correct order
    const orderedChunks = Array.from(this.chunkTorrents.entries())
      .sort(([indexA], [indexB]) => indexA - indexB)
      .map(([index, data]) => data.blob);

    // 5. Create final video blob
    const finalVideoBlob = await this.mergeBlobs(orderedChunks);

    // 6. Play the video!
    this.playReassembledVideo(finalVideoBlob);
  }

  async mergeBlobs(blobs) {
    // Method 1: Simple concatenation for same-type blobs
    const mergedBlob = new Blob(blobs, { type: "video/mp4" });
    return mergedBlob;

    // Method 2: If you need more control, use ArrayBuffers
    /*
    const arrayBuffers = await Promise.all(
      blobs.map(blob => blob.arrayBuffer())
    );
    
    const totalLength = arrayBuffers.reduce((sum, buf) => sum + buf.byteLength, 0);
    const mergedArray = new Uint8Array(totalLength);
    
    let offset = 0;
    arrayBuffers.forEach(buffer => {
      mergedArray.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    });
    
    return new Blob([mergedArray], { type: 'video/mp4' });
    */
  }

  playReassembledVideo(blob) {
    // Create object URL for the video element
    const videoUrl = URL.createObjectURL(blob);

    // Play in video element
    const videoElement = document.createElement("video");
    videoElement.src = videoUrl;
    videoElement.controls = true;
    videoElement.style.width = "100%";

    // Add to your UI
    const videoContainer = document.getElementById("videoPlayer");
    videoContainer.innerHTML = "";
    videoContainer.appendChild(videoElement);

    // Auto-play (with user gesture)
    videoElement.play().catch((e) => {
      console.log("Auto-play prevented, user interaction required");
    });
  }

  // Bonus: Progressive playback - start playing while still downloading!
  async watchProgressive(chunkMessages) {
    const orderedMessages = chunkMessages.sort(
      (a, b) => a.chunkIndex - b.chunkIndex
    );

    for (const message of orderedMessages) {
      const blob = await this.downloadChunk(message.magnet);
      this.reassembledBlobs.push(blob);

      // Update video source with what we have so far
      if (this.reassembledBlobs.length >= 2) {
        // Wait for a few chunks
        const tempBlob = new Blob(this.reassembledBlobs, { type: "video/mp4" });
        this.updateVideoSource(tempBlob);
      }
    }
  }
}
