
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Button, View, Text } from 'react-native';
import * as FileSystem from 'expo-file-system';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function App() {
  const [video, setVideo] = useState(null);

  const pickVideo = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: true,
      aspect: [16, 9],
      quality: 1,
    });

    if (!result.canceled) {
      setVideo(result.assets[0]);
    }
  };

  const uploadVideo = async () => {
    if (!video) return;

    try {
      // Read the file data as a Blob
      const fileInfo = await FileSystem.getInfoAsync(video.uri);
      const blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = function () {
          resolve(xhr.response);
        };
        xhr.onerror = function (e) {
          console.log(e);
          reject(new TypeError('Network request failed'));
        };
        xhr.responseType = 'blob';
        xhr.open('GET', video.uri, true);
        xhr.send(null);
      });

      const formData = new FormData();
      formData.append('video', blob, 'video.mp4'); // Append Blob with filename

      const response = await fetch(`${BACKEND_URL}/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = await response.json();
      console.log('Upload successful:', data);
      // Handle the returned IPFS URL and magnet link
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Button title="Pick a video" onPress={pickVideo} />
      {video && <Button title="Upload video" onPress={uploadVideo} />}
      {video && <Text>Video Selected</Text>}
    </View>
  );
}