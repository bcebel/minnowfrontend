import React from "react";
import { Platform, View, Text } from "react-native";
import { WebView } from "react-native-webview";

// Vanilla HTML Video Picker Component as a string
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Video Picker</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
    }
    video-picker {
      display: block;
      margin-top: 20px;
    }
    video {
      max-width: 100%;
      margin-top: 10px;
    }
    button {
      margin-top: 20px;
      padding: 10px 20px;
      background-color: #007bff;
      color: white;
      border: none;
      cursor: pointer;
    }
    button:disabled {
      background-color: #ccc;
    }
  </style>
</head>
<body>
  <h1>Video Picker</h1>
  <video-picker></video-picker>

  <script>
    class VideoPicker extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.shadowRoot.innerHTML = \`
          <style>
            input[type="file"] {
              margin-bottom: 10px;
            }
          </style>
          <input type="file" accept="video/*">
          <video controls></video>
        \`;
      }

      connectedCallback() {
        const fileInput = this.shadowRoot.querySelector('input[type="file"]');
        const videoElement = this.shadowRoot.querySelector('video');

        fileInput.addEventListener('change', (event) => {
          const file = event.target.files[0];
          if (file) {
            const videoURL = URL.createObjectURL(file);
            videoElement.src = videoURL;
            videoElement.style.display = 'block';

            // Emit a custom event with the selected file
            this.dispatchEvent(new CustomEvent('file-selected', { detail: file }));
          } else {
            videoElement.src = '';
            videoElement.style.display = 'none';
          }
        });
      }
    }

    customElements.define('video-picker', VideoPicker);
  </script>
<label for="title">Title:</label>
<input type="text" id="title" placeholder="Enter video title" />

<label for="description">Description:</label>
<textarea id="description" placeholder="Enter video description"></textarea>
  <button id="uploadButton" disabled>Upload Video</button>
  <button id="playTorrentButton" disabled>Play Torrent</button>
  <video id="torrentVideo" controls style="display: none; width: 100%; margin-top: 20px;"></video>

  <!-- Include WebTorrent Library -->
  <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>
  <script>
    const picker = document.querySelector('video-picker');
    const uploadButton = document.getElementById('uploadButton');
    const playTorrentButton = document.getElementById('playTorrentButton');
    const torrentVideo = document.getElementById('torrentVideo');

    let selectedFile = null;
    let magnetLink = null;
    let client = null;

    picker.addEventListener('file-selected', (event) => {
      selectedFile = event.detail;

        if (selectedFile) {
    console.log("Selected file:", selectedFile.name, selectedFile.type);
      uploadButton.disabled = false;
        } else {
    uploadButton.disabled = true;
  }
    });

    uploadButton.addEventListener('click', async () => {
      if (!selectedFile) return;

      const token = localStorage.getItem("token"); // Retrieve the JWT token
      if (!token) {
        alert("You must log in to upload files.");
        return;
      }

  const title = document.getElementById("title").value || "Untitled Video";
  const description = document.getElementById("description").value || "";
  
      const formData = new FormData();
      formData.append('video', selectedFile);
        formData.append('title', title);
  formData.append('description', description);

      try {
        const response = await fetch('https://minnowspacebackend-e6635e46c3d0.herokuapp.com/upload', {
          method: 'POST',
          headers: {
            Authorization: \`Bearer \${token}\`, // Properly escaped backticks
          },
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          magnetLink = result.magnetLink;
          alert(\`Upload successful!\\nIPFS URL: \${result.ipfsUrl}\\nMagnet Link: \${result.magnetLink}\`);
          console.log(\`Upload successful!\\nIPFS URL: \${result.ipfsUrl}\\nMagnet Link: \${result.magnetLink}\`);
          playTorrentButton.disabled = false;
        } else {
          alert('Upload failed.');
        }
      } catch (error) {
        console.error(error);
        alert('An error occurred while uploading.');
      }
    });

    playTorrentButton.addEventListener('click', () => {
      if (!magnetLink) {
        alert('No magnet link available.');
        return;
      }

      if (!client) {
        client = new WebTorrent();
      }

      client.add(magnetLink, (torrent) => {
        console.log('Torrent added:', torrent);

        // Play the first file in the torrent
        const file = torrent.files.find((f) => f.name.endsWith('.mp4'));
        if (file) {
          file.renderTo(torrentVideo, () => {
            torrentVideo.style.display = 'block';
            console.log('Playing torrent file:', file.name);
          });
        } else {
          alert('No playable video file found in the torrent.');
        }
      });
    });
  </script>
</body>
</html>
`;
export default function App() {
  // Detect if the app is running on the web
  const isWeb = Platform.OS === "web";

  if (isWeb) {
    // Render the HTML directly for the web
    return (
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 20, textAlign: "center", margin: 20 }}>
          Upload your greatest. Let us bask in it.
        </Text>
        {/* Inject the HTML into the DOM */}
        <iframe
          srcDoc={htmlContent}
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            border: "none",
          }}
          title="Video Picker"
        />
      </View>
    );
  }

  // For non-web platforms, use a WebView
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 20, textAlign: "center", margin: 20 }}>
        Mobile Version - WebView
      </Text>
      <WebView
        originWhitelist={["*"]}
        source={{ html: htmlContent }}
        style={{ flex: 1 }}
      />
    </View>
  );
}
