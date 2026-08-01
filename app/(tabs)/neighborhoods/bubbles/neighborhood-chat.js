// app/neighborhood-chat.js
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  View,
  ScrollView,
  Keyboard,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  Text,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { gql, useQuery, useMutation, useApolloClient } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { useVideoPlayer, VideoView } from "expo-video";
import AdMessage from "../../../../components/AdMessage";
import ChatMediaRenderer from "../../../../components/ChatMediaRenderer";
import NeighborhoodLiveStreamRecorder from "@/components/NeighborhoodLiveStreamRecorder";
import webtorrentService from "../../../../utils/webtorrentService";
import heic2any from "heic2any";
import convert from "heic-convert/browser";
const myTracker = "wss://tracker-0ad4cca9fd92.herokuapp.com";
// Helper function to create optimistic message
const createOptimisticMessage = (type, fileName, url, thumbnailUrl) => {
  const tempId = `temp-${Date.now()}`;
  return {
    id: tempId,
    content: `Shared: ${fileName}`,
    createdAt: Date.now().toString(),
    fileName,
    fileType: type,
    imageUrl: type === "image" ? url : null,
    videoUrl: type === "video" ? url : null,
    fileUrl: type === "file" ? url : null,
    thumbnailUrl,
    sender: {
      username: username,
      profilePhoto: AsyncStorage.getItem("profilePhoto") || null,
    },
    __typename: "Message",
  };
};

const safeFileName = (asset) =>
  asset.name || asset.fileName || asset.uri.split("/").pop() || "media";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const getFileType = (fileName) => {
  if (!fileName) return "unknown";
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (["mp4", "mov", "webm", "avi", "mkv"].includes(ext)) return "video";

  if (
    ["jpg", "jpeg", "png", "gif", "avif", "heic", "heif", "webp"].includes(ext)
  )
    return "image";

  if (["pdf", "doc", "docx"].includes(ext)) return "document";

  return "unknown";
};

// Simple Video Player Component
const SimpleVideoPlayer = ({ url, fileName, isTorrent = false }) => {
  const player = useVideoPlayer(url, (player) => {
    player.loop = false;
  });

  useEffect(() => {
    if (player) {
      player.play();
    }

    return () => {
      if (isTorrent && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    };
  }, [player, url, isTorrent]);

  return (
    <TouchableOpacity
      style={styles.videoContainer}
      onPress={() => player.play()}
    >
      <VideoView
        player={player}
        style={styles.videoPlayer}
        showsControls={true}
        contentFit="contain"
        allowsExternalPlayback={true}
      />
      {fileName && (
        <Text style={styles.videoCaption} numberOfLines={1}>
          {fileName} {isTorrent && "🔗"}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const GET_NEIGHBORHOOD_MESSAGES = gql`
  query GetNeighborhoodMessages($neighborhoodId: ID!) {
    neighborhoodMessages(neighborhoodId: $neighborhoodId) {
      id
      content
      room
      createdAt
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      thumbnailUrl
      sessionId
      chunkIndex
      magnetLink
      sender {
        id
        username
        profilePhoto
      }
    }
  }
`;

const GET_NEIGHBORHOOD_INFO = gql`
  query GetNeighborhood($id: ID!) {
    neighborhood(id: $id) {
      id
      name
      type
      owner {
        username
      }
      members {
        user {
          id
          username
          profilePhoto
        }
        role
        joinedAt
      }
      createdAt
      description
    }
  }
`;

const SEND_NEIGHBORHOOD_MESSAGE = gql`
  mutation SendNeighborhoodMessage(
    $content: String!
    $neighborhoodId: ID!
    $fileName: String
    $fileType: String
    $imageUrl: String
    $videoUrl: String
    $fileUrl: String
    $magnetLink: String
    $mimeType: String
    $thumbnailUrl: String
    $sessionId: String
    $chunkIndex: Int
    $totalChunks: Int
  ) {
    sendMessage(
      content: $content
      neighborhoodId: $neighborhoodId
      room: "neighborhood"
      fileName: $fileName
      fileType: $fileType
      imageUrl: $imageUrl
      videoUrl: $videoUrl
      fileUrl: $fileUrl
      magnetLink: $magnetLink
      mimeType: $mimeType
      sessionId: $sessionId
      chunkIndex: $chunkIndex
      totalChunks: $totalChunks
      thumbnailUrl: $thumbnailUrl
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      sessionId
      chunkIndex
      totalChunks
      fileType
      magnetLink
      mimeType
      thumbnailUrl
      room
      createdAt
      sender {
        id
        username
        profilePhoto
      }
    }
  }
`;

const GET_RANDOM_AFFILIATE_LINK = gql`
  query GetRandomAffiliateLink {
    randomAffiliateLink {
      id
      url
      title
      imageUrl
      description
      clicks
    }
  }
`;

const DELETE_NEIGHBORHOOD_MESSAGE = gql`
  mutation DeleteNeighborhoodMessage($messageId: ID!) {
    deleteMessage(messageId: $messageId)
  }
`;

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const formatTimestamp = (timestamp) => {
  try {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "Now";
  }
};

const getProfilePhotoUrl = (profilePhoto) => {
  if (!profilePhoto) {
    return "https://via.placeholder.com/40";
  }

  if (profilePhoto.startsWith("http")) {
    return profilePhoto;
  }

  if (profilePhoto.startsWith("blob:")) {
    return profilePhoto;
  }

  if (profilePhoto.startsWith("Qm") || profilePhoto.startsWith("baf")) {
    return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
  }

  return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
};

const handleFilePress = async (message) => {
  try {
    if (!message.fileUrl) {
      Alert.alert("Error", "No file URL available");
      return;
    }

    const ipfsUrl = message.fileUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);

    if (Platform.OS === "web") {
      const link = document.createElement("a");
      link.href = ipfsUrl;
      link.download = message.fileName || "download";
      link.target = "_blank";

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Alert.alert(
        "Download Started",
        `${message.fileName || "File"} download started in new tab.`,
      );
    } else {
      Alert.alert(message.fileName || "File", "What would you like to do?", [
        {
          text: "Open in Browser",
          onPress: () =>
            Linking.openURL(ipfsUrl).catch((err) => {
              console.error("Open URL error:", err);
              Alert.alert("Error", "Could not open file");
            }),
        },
        {
          text: "Copy Link",
          onPress: async () => {
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(ipfsUrl);
                Alert.alert("Success", "Link copied to clipboard!");
              } else {
                const textArea = document.createElement("textarea");
                textArea.value = ipfsUrl;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand("copy");
                document.body.removeChild(textArea);
                Alert.alert("Success", "Link copied to clipboard!");
              }
            } catch (err) {
              Alert.alert("Error", "Could not copy link");
            }
          },
        },
        {
          text: "Cancel",
          style: "cancel",
        },
      ]);
    }
  } catch (error) {
    console.error("File press error:", error);
    Alert.alert("Error", "Failed to handle file: " + error.message);
  }
};

const normalizeImage = async (blob, fileName) => {
  const extension = fileName.split(".").pop().toLowerCase();

  if (extension === "heic" || extension === "heif") {
    console.log("🛠 Actual conversion: HEIC to JPEG...");
    try {
      const buffer = await blob.arrayBuffer();

      // ✅ FIX: Explicitly convert to Uint8Array.
      // The library's 'isHeic' check is crashing because it can't iterate a raw ArrayBuffer.
      const uint8View = new Uint8Array(buffer);

      const outputBuffer = await convert({
        buffer: uint8View, // Pass the view, not the raw buffer
        format: "JPEG",
        quality: 0.8,
      });

      const newFileName = fileName.replace(/\.(heic|heif)$/i, ".jpg");
      return new File([outputBuffer], newFileName, { type: "image/jpeg" });
    } catch (err) {
      console.error("❌ Conversion failed, falling back to spoof:", err);
      const fallbackName = fileName.replace(/\.(heic|heif)$/i, ".jpg");
      return new File([blob], fallbackName, { type: "image/jpeg" });
    }
  }

  const cleanName = fileName.replace(/\s+/g, "_").replace(/[()]/g, "");
  return new File([blob], cleanName, { type: blob.type });
};

const cleanFileName = (name) => {
  return name
    .replace(/\s+/g, "_") // Spaces to underscores
    .replace(/[()]/g, "") // Remove parentheses
    .replace(/\.(heic|heif)$/i, ".jpg"); // Force the extension to jpg for the DB
};

const getMimeTypeFromExtension = (filename) => {
  const ext = filename.split(".").pop().toLowerCase();
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    bmp: "image/bmp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
  };
  return mimeTypes[ext] || "application/octet-stream";
};

export default function NeighborhoodChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const neighborhoodId = params.neighborhoodId;
  const client = useApolloClient();

  const scrollViewRef = useRef(null);
  const messageInputRef = useRef(null);
  const [deleteMessageMutation] = useMutation(DELETE_NEIGHBORHOOD_MESSAGE);
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null);
  const [messageCount, setMessageCount] = useState(0);
  const [messages, setMessages] = useState([]);
  const [showAd, setShowAd] = useState(false);
  const [currentAd, setCurrentAd] = useState(null);

  const { data: adData, refetch: fetchRandomAd } = useQuery(
    GET_RANDOM_AFFILIATE_LINK,
    {
      skip: !isAuthenticated,
    },
  );

  const TRACK_CLICK = gql`
    mutation TrackAffiliateClick($id: ID!) {
      trackAffiliateClick(id: $id)
    }
  `;

  const [trackClick] = useMutation(TRACK_CLICK);

  const handleDeleteMessage = async (messageId) => {
    const shouldProceed = await new Promise((resolve) => {
      if (Platform.OS === "web") {
        const proceed = window.confirm(
          "Are you sure you want to permanently delete this message?",
        );
        resolve(proceed);
      } else {
        Alert.alert(
          "Delete Message",
          "Are you sure you want to permanently delete this message?",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => resolve(true),
            },
          ],
        );
      }
    });

    if (!shouldProceed) {
      return;
    }

    try {
      await deleteMessageMutation({
        variables: { messageId },
        update(cache) {
          cache.modify({
            fields: {
              neighborhoodMessages(existingMessageRefs = [], { readField }) {
                return existingMessageRefs.filter(
                  (messageRef) => readField("id", messageRef) !== messageId,
                );
              },
            },
          });
        },
      });

      setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
    } catch (error) {
      console.error("❌ Deletion error:", error);
      let errorMessage = "Failed to delete message due to an unknown error.";
      if (error.graphQLErrors && error.graphQLErrors.length > 0) {
        errorMessage = error.graphQLErrors[0].message;
      } else if (error.networkError) {
        errorMessage = `Network Error: ${error.networkError.message}`;
      } else {
        errorMessage = error.message;
      }

      Alert.alert(
        "Deletion Failed",
        errorMessage.replace("GraphQL error: ", ""),
      );
    }
  };

  const { data: neighborhoodData, loading: neighborhoodLoading } = useQuery(
    GET_NEIGHBORHOOD_INFO,
    {
      variables: { id: neighborhoodId },
      skip: !neighborhoodId,
    },
  );

  const { loading, error, data, refetch } = useQuery(
    GET_NEIGHBORHOOD_MESSAGES,
    {
      variables: { neighborhoodId },
      fetchPolicy: "cache-and-network",
      skip: !isAuthenticated || !neighborhoodId,
    },
  );

  const [sendMessageMutation] = useMutation(SEND_NEIGHBORHOOD_MESSAGE);

  useEffect(() => {
    if (!window.heic2any) {
      console.log("💉 Injecting heic2any script...");
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);
  
  useEffect(() => {
    if (data?.neighborhoodMessages) {
      const cleanMessages = data.neighborhoodMessages
        .filter((m) => !m.sessionId)
        // SORT: Ensure oldest is at top, newest is at bottom
        .sort((a, b) => parseInt(a.createdAt) - parseInt(b.createdAt));

      setMessages(cleanMessages);
    }
  }, [data?.neighborhoodMessages]);

  const isNeighborhoodAdmin = useMemo(() => {
    if (!username || !neighborhoodData?.neighborhood) return false;

    const neighborhood = neighborhoodData.neighborhood;
    const isOwner = neighborhood.owner?.username === username;

    const member = neighborhood.members?.find(
      (m) => m.user?.username === username,
    );
    const isAdmin = member?.role === "admin";

    return isOwner || isAdmin;
  }, [neighborhoodData, username]);

  const renderMessage = useCallback(
    (message) => {
      const senderUsername = message.sender?.username || "Unknown";
      const profilePhoto = getProfilePhotoUrl(message.sender?.profilePhoto);
      const timestamp = formatTimestamp(message.createdAt);

      return (
        <View key={message.id} style={styles.messageContainer}>
          <Image
            source={{ uri: profilePhoto }}
            style={styles.profileImage}
            onError={(e) =>
              console.log("Profile photo error:", e.nativeEvent.error)
            }
          />
          <View style={styles.messageContent}>
            <View style={styles.messageHeader}>
              <Text style={styles.username}>{senderUsername}</Text>
              <Text style={styles.timestamp}>{timestamp}</Text>
            </View>

            {message.content && !message.content.startsWith("Shared: ") && (
              <Text style={styles.messageText}>{message.content}</Text>
            )}

            {/* This will now properly render media */}
            {(message.imageUrl ||
              message.videoUrl ||
              message.fileUrl ||
              message.magnetLink) && <ChatMediaRenderer message={message} />}

            {message.content && message.content.startsWith("Shared: ") && (
              <Text style={styles.sharedLabel}>{message.content}</Text>
            )}

            {isNeighborhoodAdmin && (
              <TouchableOpacity
                onPress={() => handleDeleteMessage(message.id)}
                style={styles.deleteButton}
              >
                <Text style={styles.deleteIcon}>🗑️</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    },
    [isNeighborhoodAdmin],
  );

  useEffect(() => {
    fetchRandomAd();
  }, []);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        if (!token) {
          Alert.alert(
            "Authentication Required",
            "Please log in to access chat",
          );
          router.replace("/login");
          return;
        }

        setUsername(savedUsername || "");
        setIsAuthenticated(true);
        initializeSocket(token);
      } catch (error) {
        console.error("Auth check error:", error);
        Alert.alert("Error", "Failed to initialize chat");
      }
    };

    checkAuth();

    return () => {
      socket?.disconnect();
      webtorrentService.cleanup(["video_", "_chunk_"]);
    };
  }, [neighborhoodId]);

  const showRandomAd = async () => {
    try {
      console.log("🔄 Fetching random affiliate ad...");
      const result = await fetchRandomAd();

      if (result.data?.randomAffiliateLink) {
        setCurrentAd(result.data.randomAffiliateLink);
        setShowAd(true);

        setTimeout(() => {
          setShowAd(false);
        }, 30000);
      }
    } catch (error) {
      console.error("❌ Failed to fetch ad:", error);
    }
  };

  const initializeSocket = (token) => {
    console.log("🔌 Initializing neighborhood socket...");

    const newSocket = io(BACKEND_URL, {
      auth: { token },
      path: "/socket.io-chat/",
      transports: ["polling"],
    });

    newSocket.on("connect", () => {
      console.log("✅ Neighborhood socket connected");
      refetch(); // Initial fetch
      setSocket(newSocket);
      newSocket.emit("join-neighborhood", neighborhoodId);
    });

    newSocket.on("connect_error", (err) => {
      console.error("❌ Neighborhood socket connection error:", err);
    });

    newSocket.on("message", async (newMsg) => {
      console.log("📨 New message via socket:", newMsg.content);

      setMessages((prev) => {
        if (prev.some((m) => m.id === newMsg.id)) return prev;
        return [...prev, newMsg];
      });

      // Refetch after a short delay to ensure media is included
      setTimeout(() => {
        refetch();
      }, 500);

      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 300);
    });

    // Add this new event listener for refresh
    newSocket.on("refresh-messages", async () => {
      console.log("🔄 Refreshing messages via socket");
      await refetch();
    });

    setSocket(newSocket);
  };

  const takeCameraMedia = async () => {
    setUploading(true);
    setUploadType("camera");
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission needed", "Camera access required.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaType.All,
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      const type = asset.type === "image" ? "image" : "video";

      const fileName =
        asset.fileName ||
        asset.uri.split("/").pop() ||
        `${type}-${Date.now()}.${type === "image" ? "jpg" : "mp4"}`;

      await unifiedUpload({ uri: asset.uri, name: fileName }, type, 0, "");
    } catch (error) {
      console.error("Camera capture error:", error);
      Alert.alert("Error", "Failed to capture media");
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  // Replace your openCamera function with this:
  const openCamera = async () => {
    if (Platform.OS === "web") {
      // For web browsers (including macOS)
      return openCameraWeb();
    } else {
      // For mobile (React Native)
      return openCameraMobile();
    }
  };

  // Replace the openCameraWeb function with this enhanced version:
  const openCameraWeb = async () => {
    try {
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Fallback to file input for browsers that don't support camera
        return openCameraFallback();
      }

      // Create UI for camera selection
      const container = document.createElement("div");
      container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.95);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;

      const title = document.createElement("h2");
      title.textContent = "📸 Camera";
      title.style.cssText = `
      color: #00ffff;
      margin-bottom: 30px;
      text-align: center;
    `;

      const modeSelector = document.createElement("div");
      modeSelector.style.cssText = `
      display: flex;
      gap: 20px;
      margin-bottom: 30px;
    `;

      const photoModeBtn = document.createElement("button");
      photoModeBtn.textContent = "📷 Take Photo";
      photoModeBtn.style.cssText = `
      padding: 15px 30px;
      font-size: 16px;
      background: #00ffff;
      color: #130720;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-weight: bold;
    `;

      const videoModeBtn = document.createElement("button");
      videoModeBtn.textContent = "🎥 Record Video";
      videoModeBtn.style.cssText = `
      padding: 15px 30px;
      font-size: 16px;
      background: #333;
      color: white;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-weight: bold;
    `;

      let currentMode = "photo"; // 'photo' or 'video'

      photoModeBtn.onclick = () => {
        currentMode = "photo";
        photoModeBtn.style.background = "#00ffff";
        photoModeBtn.style.color = "#130720";
        videoModeBtn.style.background = "#333";
        videoModeBtn.style.color = "white";
        startCamera("photo");
      };

      videoModeBtn.onclick = () => {
        currentMode = "video";
        videoModeBtn.style.background = "#00ffff";
        videoModeBtn.style.color = "#130720";
        photoModeBtn.style.background = "#333";
        photoModeBtn.style.color = "white";
        startCamera("video");
      };

      modeSelector.appendChild(photoModeBtn);
      modeSelector.appendChild(videoModeBtn);

      const previewContainer = document.createElement("div");
      previewContainer.style.cssText = `
      width: 80%;
      max-width: 600px;
      margin-bottom: 20px;
      position: relative;
    `;

      const preview = document.createElement("video");
      preview.style.cssText = `
      width: 100%;
      border-radius: 12px;
      background: #000;
    `;

      const controlsContainer = document.createElement("div");
      controlsContainer.style.cssText = `
      display: flex;
      gap: 20px;
      margin-top: 20px;
    `;

      const captureBtn = document.createElement("button");
      captureBtn.textContent = "📸 Capture";
      captureBtn.style.cssText = `
      padding: 15px 30px;
      font-size: 16px;
      background: #00ff00;
      color: #000;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-weight: bold;
      display: none;
    `;

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "❌ Return";
      cancelBtn.style.cssText = `
      padding: 15px 30px;
      font-size: 16px;
      background: #ff3333;
      color: white;
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-weight: bold;
    `;

      let mediaRecorder = null;
      let recordedChunks = [];
      let stream = null;
      let isRecording = false;

      const startCamera = async (mode) => {
        try {
          // Stop any existing stream
          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
          }

          // Clear previous preview
          preview.srcObject = null;

          // Request camera with video constraints
          const constraints = {
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: "environment",
            },
            audio: mode === "video", // Include audio for video mode
          };

          stream = await navigator.mediaDevices.getUserMedia(constraints);
          preview.srcObject = stream;
          preview.muted = true;
          preview.play();

          captureBtn.style.display = "block";

          if (mode === "video") {
            captureBtn.textContent = "⏺️ Start Recording";
            captureBtn.style.background = "#ff3333";

            // Set up media recorder
            mediaRecorder = new MediaRecorder(stream, {
              mimeType: "video/webm;codecs=vp9,opus",
            });

            recordedChunks = [];

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                recordedChunks.push(event.data);
              }
            };

            mediaRecorder.onstop = async () => {
              const blob = new Blob(recordedChunks, { type: "video/webm" });
              const fileName = `camera_video_${Date.now()}.webm`;
              const url = URL.createObjectURL(blob);

              await unifiedUpload(
                {
                  uri: url,
                  name: fileName,
                  size: blob.size,
                  type: "video/webm",
                },
                "video",
                blob.size,
                "video/webm",
              );

              URL.revokeObjectURL(url);
            };
          } else {
            captureBtn.textContent = "📸 Take Photo";
            captureBtn.style.background = "#00ff00";
          }
        } catch (error) {
          console.error("Camera start error:", error);
          Alert.alert(
            "Camera Error",
            "Failed to start camera. Please check permissions.",
          );
        }
      };

      captureBtn.onclick = () => {
        if (currentMode === "photo") {
          // Take photo
          const canvas = document.createElement("canvas");
          canvas.width = preview.videoWidth;
          canvas.height = preview.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(preview, 0, 0);

          canvas.toBlob(
            async (blob) => {
              const fileName = `camera_photo_${Date.now()}.jpg`;
              const url = URL.createObjectURL(blob);

              await unifiedUpload(
                {
                  uri: url,
                  name: fileName,
                  size: blob.size,
                  type: "image/jpeg",
                },
                "image",
                blob.size,
                "image/jpeg",
              );

              URL.revokeObjectURL(url);
            },
            "image/jpeg",
            0.9,
          );
        } else if (currentMode === "video") {
          // Record video
          if (!isRecording) {
            // Start recording
            isRecording = true;
            captureBtn.textContent = "⏹️ Stop Recording";
            captureBtn.style.background = "#00ff00";
            recordedChunks = [];
            mediaRecorder.start();
          } else {
            // Stop recording
            isRecording = false;
            captureBtn.textContent = "⏺️ Start Recording";
            captureBtn.style.background = "#ff3333";
            mediaRecorder.stop();
          }
        }
      };

      cancelBtn.onclick = () => {
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
        }
        if (mediaRecorder && mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
        }
        document.body.removeChild(container);
      };

      controlsContainer.appendChild(captureBtn);
      controlsContainer.appendChild(cancelBtn);

      previewContainer.appendChild(preview);

      container.appendChild(title);
      container.appendChild(modeSelector);
      container.appendChild(previewContainer);
      container.appendChild(controlsContainer);

      document.body.appendChild(container);

      // Start with photo mode by default
      startCamera("photo");
    } catch (error) {
      console.error("Camera error:", error);

      // Fallback if camera access fails
      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        Alert.alert(
          "Camera Access Required",
          "Please allow camera access in your browser settings, or use the file upload option.",
          [{ text: "OK" }],
        );
      } else {
        // Use fallback method
        openCameraFallback();
      }
    }
  };

  const openCameraFallback = () => {
    // Fallback to file input with camera capture attribute
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*";
    input.capture = "environment"; // Prefer back camera
    input.style.display = "none";

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const type = file.type.startsWith("image/") ? "image" : "video";
        const uri = URL.createObjectURL(file);

        await unifiedUpload(
          {
            uri,
            name: file.name,
            file: file,
            size: file.size,
            type: file.type,
          },
          type,
          file.size,
          file.type,
        );

        URL.revokeObjectURL(uri);
      }
    };

    document.body.appendChild(input);
    input.click();
    setTimeout(() => document.body.removeChild(input), 1000);
  };

  const openCameraMobile = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Camera access required.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      const type = asset.type === "image" ? "image" : "video";
      await unifiedUpload(
        {
          uri: asset.uri,
          name: asset.fileName || asset.uri.split("/").pop() || "camera-media",
        },
        type,
        0,
        "",
      );
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !socket) return;

    const messageContent = newMessage.trim();

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      content: messageContent,
      createdAt: Date.now().toString(),
      sender: {
        username: username,
        profilePhoto: await AsyncStorage.getItem("profilePhoto"),
      },
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");

    setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      await sendMessageMutation({
        variables: {
          content: messageContent,
          neighborhoodId: neighborhoodId,
        },
      });
      console.log("✅ Neighborhood message sent");
    } catch (err) {
      console.error("❌ Send message error:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert("Error", "Failed to send message");
      setNewMessage(messageContent);
    }
  };

  // In your neighborhood-chat.js, update the unifiedUpload function:

  const unifiedUpload = async (asset, type, fileSize, mimeType) => {
    setUploading(true);
    let uploadUri = null;

    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      let safeName = safeFileName(asset);
      let finalUri = asset.uri;

      if (Platform.OS === "web") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();

        // Check if it's a large video
        const isLargeVideo = blob.size > 10 * 1024 * 1024; // 10MB

        if (type === "video" && isLargeVideo) {
          try {
            // Try to seed via P2P first
            const seedResult = await webtorrentService.seed(blob, {
              name: safeName,
            });

            // Generate thumbnail
            let thumbnailUrl = null;
            try {
              const videoUrl = URL.createObjectURL(blob);
              const thumbResult = await generateThumbnail(videoUrl);
              thumbnailUrl = thumbResult?.base64;
              URL.revokeObjectURL(videoUrl);
            } catch (e) {
              console.log("⚠️ Could not generate thumbnail");
            }

            // Send message with magnet link
            await sendMessageMutation({
              variables: {
                content: `🎬 P2P Video: ${safeName}`,
                neighborhoodId: neighborhoodId,
                fileName: safeName,
                fileType: "video",
                mimeType: blob.type,
                videoUrl: null, // No IPFS URL for P2P
                magnetLink: seedResult.magnetUri,
                thumbnailUrl: thumbnailUrl,
              },
            });

            console.log("✅ Video shared via P2P");
            if (refetch) await refetch();
            return;
          } catch (p2pError) {
            console.log("⚠️ P2P failed, falling back to IPFS:", p2pError);
            // Fall through to IPFS upload
          }
        }

        // Continue with normal IPFS upload for images or if P2P failed
        if (type === "image") {
          const cleanFile = await normalizeImage(blob, safeName);
          safeName = cleanFile.name;
          uploadUri = URL.createObjectURL(cleanFile);
          finalUri = uploadUri;
        } else {
          uploadUri = URL.createObjectURL(blob);
          finalUri = uploadUri;
        }
      } else {
        safeName = cleanFileName(safeName);
      }

      // IPFS UPLOAD
      console.log(`🚀 Starting ${type} upload to IPFS...`);
      const uploadResult = await uploadToIPFS(
        finalUri,
        safeName,
        type,
        token,
        neighborhoodId,
      );

      // CACHE THE MAGNET LINK FROM IPFS
      if (uploadResult.magnetLink) {
        await webtorrentService.cacheMagnetLink(uploadResult.magnetLink, {
          fileName: safeName,
          fileType: type,
          ipfsUrl: uploadResult.ipfsUrl,
        });

        // Optional: pre-warm the magnet link (start downloading in background)
        setTimeout(() => {
          webtorrentService.prewarmMagnet(uploadResult.magnetLink).catch(() => {
            // Silent fail - it's just pre-warming
          });
        }, 1000);
      }

      // SEND MESSAGE
      await sendMessageMutation({
        variables: {
          content: `Shared: ${safeName}`,
          neighborhoodId: neighborhoodId,
          fileName: safeName,
          fileType: type,
          mimeType: type === "image" ? "image/jpeg" : mimeType,
          imageUrl: type === "image" ? uploadResult.ipfsUrl : null,
          videoUrl: type === "video" ? uploadResult.ipfsUrl : null,
          fileUrl:
            type !== "image" && type !== "video" ? uploadResult.ipfsUrl : null,
          magnetLink: uploadResult.magnetLink || "",
          thumbnailUrl: uploadResult.thumbnailUrl || null,
        },
      });

      if (refetch) await refetch();
      console.log(`✅ ${type} upload complete!`);
    } catch (error) {
      console.error("❌ Upload error:", error);
      Alert.alert("Upload Failed", error.message);
    } finally {
      if (uploadUri) {
        URL.revokeObjectURL(uploadUri);
      }
      setUploading(false);
    }
  };

  // New function for P2P video upload
  const uploadVideoViaP2P = async (videoBlob, fileName, token) => {
    try {
      console.log("🎬 Uploading video via P2P...");

      // Seed the video
      const seedResult = await webtorrentService.seedFile(videoBlob, fileName);

      // Generate thumbnail
      let thumbnailUrl = null;
      try {
        const videoUrl = URL.createObjectURL(videoBlob);
        const thumbResult = await generateThumbnail(videoUrl);
        thumbnailUrl = thumbResult?.base64;
        URL.revokeObjectURL(videoUrl);
      } catch (e) {
        console.log("⚠️ Could not generate thumbnail");
      }

      // Send message with magnet link
      await sendMessageMutation({
        variables: {
          content: `🎬 P2P Video: ${fileName}`,
          neighborhoodId: neighborhoodId,
          fileName: fileName,
          fileType: "video",
          mimeType: videoBlob.type,
          videoUrl: null, // No IPFS URL for P2P-only
          magnetLink: seedResult.magnetUri,
          thumbnailUrl: thumbnailUrl,
        },
      });

      console.log("✅ Video shared via P2P with magnet link");
    } catch (error) {
      console.error("❌ P2P upload failed:", error);
      throw error;
    }
  };

  // Simplify the pickFile function
  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
    });

    if (!result.canceled) {
      let asset = result.assets[0];
      const fileName = safeFileName(asset);
      const resolvedType = getFileType(fileName);

      // Handle Image Normalization
      if (resolvedType === "image") {
        try {
          const response = await fetch(asset.uri);
          const rawBlob = await response.blob();
          const cleanFile = await normalizeImage(rawBlob, asset.name);

          asset = {
            ...asset,
            uri: URL.createObjectURL(cleanFile),
            name: cleanFile.name,
            mimeType: cleanFile.type,
            size: cleanFile.size,
          };
        } catch (err) {
          console.error("Image normalization error:", err);
        }
      }

      // Just use unifiedUpload - it will handle P2P vs IPFS decision
      await unifiedUpload(asset, resolvedType, asset.size, asset.mimeType);
    }
  };

  const uploadChunkedVideo = async (asset) => {
    try {
      console.log("🎬 Starting chunked video upload...");

      let originalBlob;
      if (Platform.OS === "web" && asset.file) {
        // Optimized: Use file directly
        originalBlob = asset.file;
      } else {
        const response = await fetch(asset.uri);
        const arrayBuffer = await response.arrayBuffer();
        originalBlob = new Blob([arrayBuffer], { type: "video/mp4" });
      }

      const CHUNK_SIZE = 2 * 1024 * 1024;
      const totalChunks = Math.ceil(originalBlob.size / CHUNK_SIZE);
      const sessionId = `video_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      console.log(`📦 Splitting into ${totalChunks} chunks...`);

      let thumbnailUrl = null;
      if (Platform.OS === "web") {
        try {
          const thumbResult = await generateThumbnail(asset.uri);
          if (thumbResult) thumbnailUrl = thumbResult.base64;
        } catch (e) {
          console.log("⚠️ Could not generate thumbnail");
        }
      }

      const safeName = safeFileName(asset);

      await sendMessageMutation({
        variables: {
          content: `🎬 Neighborhood Video (${totalChunks} parts)`,
          neighborhoodId: neighborhoodId,
          fileName: safeName,
          fileType: "video_chunked",
          sessionId: sessionId,
          totalChunks: totalChunks,
          thumbnailUrl: thumbnailUrl,
          imageUrl: null,
          videoUrl: null,
          fileUrl: null,
          magnetLink: null,
        },
      });

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, originalBlob.size);
        const chunk = originalBlob.slice(start, end, "video/mp4");

        await uploadSingleChunk(chunk, i, sessionId, totalChunks, safeName);

        if (i < totalChunks - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      console.log("✅ All chunks uploaded!");
      Alert.alert(
        "Upload Successful",
        "Large video shared successfully via P2P.",
      );
      return true;
    } catch (error) {
      console.error("❌ Chunked Upload Failed:", error);
      Alert.alert(
        "Chunked Upload Failed",
        error.message || "An unexpected error occurred.",
      );
      return false;
    }
  };

  const uploadSingleChunk = (
    chunk,
    index,
    sessionId,
    totalChunks,
    fileName,
  ) => {
    return new Promise(async (resolve, reject) => {
      // 5 minute timeout for seeding a chunk
      const timeout = setTimeout(() => {
        reject(new Error(`Seeding timeout for chunk ${index + 1}`));
      }, 300000);

      try {
        // 1. Grab the Global Champ directly (Skip the service!)
        const client = window.globalWebTorrentClient;

        if (!client) {
          throw new Error(
            "WebTorrent Client not initialized. Refresh the page.",
          );
        }

        // 2. Seed it using the global trackers from +html.tsx
        client.seed(
          chunk,
          {
            name: `${sessionId}_chunk_${index}`,
            announce: window.enhancedTrackers, // Use the ones from your HTML file
          },
          async (torrent) => {
            console.log(
              `✅ Chunk ${index + 1}/${totalChunks} is now LIVE on P2P`,
            );

            // 3. Send the message with the REAL magnet link
            try {
              await sendMessageMutation({
                variables: {
                  content: `Shared: ${fileName} (Part ${index + 1})`,
                  neighborhoodId: neighborhoodId,
                  fileName: `${fileName}_part${index}`,
                  fileType: "video_chunk",
                  magnetLink: torrent.magnetURI, // THIS is what the neighbor needs
                  chunkIndex: index,
                  sessionId: sessionId,
                  totalChunks: totalChunks,
                },
              });
              clearTimeout(timeout);
              resolve();
            } catch (err) {
              clearTimeout(timeout);
              reject(err);
            }
          },
        );
      } catch (error) {
        console.error("❌ Seeding failed:", error);
        clearTimeout(timeout);
        reject(error);
      }
    });
  };

  const getMimeType = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    const mimeTypes = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      heic: "image/heic",
      mp4: "video/mp4",
      mov: "video/quicktime",
    };
    return mimeTypes[ext] || "application/octet-stream";
  };

  const generateThumbnail = async (videoUrl) => {
    if (Platform.OS !== "web") {
      console.log("📱 Skipping web-based thumbnail generation on Native.");
      return null;
    }
    console.log("🔄 Starting thumbnail generation for:", videoUrl);

    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = videoUrl;
      video.currentTime = 2;
      video.muted = true;

      video.onloadeddata = async () => {
        console.log("✅ Video loaded successfully");

        try {
          const originalWidth = video.videoWidth;
          const originalHeight = video.videoHeight;
          const targetWidth = 320;
          const targetHeight = (originalHeight / originalWidth) * targetWidth;
          const canvas = document.createElement("canvas");
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          const ctx = canvas.getContext("2d");

          console.log("🖼️ Drawing video to canvas...");
          ctx.drawImage(video, 0, 0, 320, 240);

          const base64 = canvas.toDataURL("image/jpeg", 0.8);
          const sizeEstimate = base64.length * (3 / 4) - 2;

          console.log(
            `📸 Thumbnail ready: JPEG (via DataURL), ~${sizeEstimate.toFixed(
              0,
            )} bytes`,
          );

          resolve({
            base64,
            format: "jpeg",
            size: sizeEstimate,
          });
        } catch (error) {
          console.error("❌ Canvas/Blob conversion failed:", error);
          reject(error);
        }
      };

      video.onerror = (e) => {
        console.error("❌ Video load failed:", e);
        reject(new Error(`Video load error: ${e.message}`));
      };

      setTimeout(() => {
        if (video.readyState < 2) {
          reject(new Error("Video load timeout (10s)"));
        }
      }, 10000);

      console.log("⏳ Loading video...");
      video.load();
    });
  };

  const uploadToIPFS = async (
    fileUri,
    fileName,
    type,
    token,
    neighborhoodId,
  ) => {
    try {
      let result;

      if (Platform.OS === "web") {
        const formData = new FormData();
        const response = await fetch(fileUri);
        const blob = await response.blob();
        formData.append("video", blob, fileName);
        formData.append("title", fileName);
        formData.append("description", `Uploaded ${type} - ${fileName}`);

        if (neighborhoodId) {
          formData.append("neighborhoodId", neighborhoodId);
        }

        console.log("📤 IPFS Upload (Web):", {
          fileName,
          type,
          neighborhoodId,
        });

        const res = await fetch(`${BACKEND_URL}/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`IPFS upload failed: ${res.status} – ${errorText}`);
        }
        result = await res.json();
      } else {
        console.log("📤 IPFS Upload (Native):", {
          fileName,
          type,
          neighborhoodId,
        });

        const uploadResponse = await FileSystem.uploadAsync(
          `${BACKEND_URL}/upload`,
          fileUri,
          {
            httpMethod: "POST",
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: "video",
            mimeType: getMimeTypeFromExtension(fileName),
            parameters: {
              title: fileName,
              description: `Uploaded ${type} - ${fileName}`,
              neighborhoodId: neighborhoodId || "",
            },
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
          throw new Error(
            `IPFS upload failed: ${uploadResponse.status} – ${uploadResponse.body}`,
          );
        }
        result = JSON.parse(uploadResponse.body);
      }

      const { ipfsUrl, magnetLink } = result;
      console.log("✅ IPFS Result:", { ipfsUrl, magnetLink });

      let thumbnailUrl = null;

      if (type === "video") {
        try {
          console.log("🎬 Starting thumbnail generation for video...");

          const thumbResult = await generateThumbnail(fileUri);

          if (thumbResult) {
            const { base64, format, size } = thumbResult;
            console.log(
              `✅ ${format.toUpperCase()} thumbnail generated: ${size} bytes`,
            );
            thumbnailUrl = base64;
          } else {
            console.log("⚠️ No thumbnail generated (likely Native).");
          }
        } catch (thumbnailError) {
          console.error(
            "❌ Thumbnail generation failed completely:",
            thumbnailError.message,
          );
        }
      }

      console.log("📊 Final return values:", {
        ipfsUrl,
        magnetLink,
        thumbnailUrl,
        hasThumbnail: !!thumbnailUrl,
      });

      return {
        ipfsUrl,
        magnetLink,
        thumbnailUrl,
      };
    } catch (error) {
      console.error("❌ IPFS upload error:", error);
      // Re-throw so unifiedUpload can catch it and show Alert
      throw error;
    }
  };

  const neighborhoodName =
    neighborhoodData?.neighborhood?.name || "Neighborhood";

  if (!isAuthenticated) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Checking authentication...</Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
        <Text style={styles.loadingText}>Loading neighborhood chat...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Error loading chat</Text>
        <Text style={styles.errorDetail}>{error.message}</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/login`,
            )
          }
          style={styles.retryButton}
        >
          <Text style={styles.retryText}>Log In</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleAdPress = (ad) => {
    trackClick({ variables: { id: ad.id } });
    Linking.openURL(ad.url);
  };

  return (
    <SafeAreaProvider>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhoods/bubbles/neighborhood-gallery?neighborhoodId=${neighborhoodId}`,
              )
            }
            style={styles.galleryButton}
          >
            <Text style={styles.galleryButtonText}> 🖼 Gallery</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhoods/invite-links?neighborhoodId=${neighborhoodId}`,
              )
            }
            style={styles.galleryButton}
          >
            <Text style={styles.galleryButtonText}>📧 Invite</Text>
          </TouchableOpacity>

          <Text style={styles.roomTitle}>🏘️ {neighborhoodName}</Text>
          <TouchableOpacity
            onPress={() =>
              router.push(
                `/neighborhood-members?neighborhoodId=${neighborhoodId}`,
              )
            }
            style={styles.membersButton}
          >
            <Text style={styles.membersButtonText}>👥</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.recorderStrip}>
          <NeighborhoodLiveStreamRecorder
            neighborhoodId={neighborhoodId}
            username={username}
            // Pass these working functions from ChatScreen to the Recorder
            unifiedUpload={unifiedUpload}
            refetch={refetch}
            socket={socket}
          />
        </View>
        {!socket && (
          <View style={styles.connectionWarning}>
            <Text style={styles.warningText}>Connecting...</Text>
          </View>
        )}
        <ScrollView style={styles.messagesList} ref={scrollViewRef}>
          {messages
            .filter(
              (msg) =>
                msg.fileType !== "video_chunk" &&
                msg.fileType !== "video_header",
            )
            .map((item, index) => {
              const showAdHere = index % 20 === 0;

              return (
                <React.Fragment key={item.id}>
                  {renderMessage(item)}

                  {showAdHere && adData?.randomAffiliateLink && (
                    <View style={styles.adContainer}>
                      <AdMessage
                        ad={adData.randomAffiliateLink}
                        onPress={() =>
                          handleAdPress(adData.randomAffiliateLink)
                        }
                      />
                    </View>
                  )}
                </React.Fragment>
              );
            })}
        </ScrollView>

        {showAd && currentAd && (
          <View style={styles.floatingAdContainer}>
            <AdMessage
              ad={currentAd}
              onPress={() => handleAdPress(currentAd)}
            />
            <TouchableOpacity
              style={styles.closeAdButton}
              onPress={() => setShowAd(false)}
            >
              <Text style={styles.closeAdText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.uploadButton} onPress={pickFile}>
            <Text style={styles.uploadButtonText}>📎</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.uploadButton} onPress={openCamera}>
            <Text style={styles.uploadButtonText}>📷</Text>
          </TouchableOpacity>
        </View>
        <View>
          <TextInput
            ref={messageInputRef}
            style={[
              styles.messageInput,
              !socket && styles.messageInputDisabled,
            ]}
            placeholder={socket ? "Type a message..." : "Connecting..."}
            placeholderTextColor="#888"
            value={newMessage}
            onChangeText={setNewMessage}
            onSubmitEditing={sendMessage}
            editable={!!socket}
          />
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newMessage.trim() || !socket) && styles.sendButtonDisabled,
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || !socket}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  messageContent: {
    flexShrink: 1,
  },
  timestampContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 4,
  },
  timestamp: {
    fontSize: 10,
    color: "#888",
    marginRight: 10,
  },
  deleteButton: {
    position: "absolute",
    right: 0,
    top: 0,
    padding: 5,
  },
  deleteIcon: {
    fontSize: 14,
    color: "red",
  },
  container: {
    flex: 1,
    backgroundColor: "#130720",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "#130720",
    padding: 5,
  },
  loadingText: {
    color: "#00ffff",
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: "#151159",
    fontSize: 18,
    textAlign: "center",
    marginBottom: 10,
  },
  errorDetail: {
    color: "#FF8888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    backgroundColor: "#111111",
    borderBottomWidth: 1,
    borderBottomColor: "#00ffff",
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  roomTitle: {
    fontSize: 18,
    color: "#00ffff",
    fontWeight: "bold",
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: "#00ffff",
  },
  connectionWarning: {
    backgroundColor: "#331100",
    padding: 8,
    alignItems: "center",
  },
  warningText: {
    fontSize: 12,
    color: "#FFAA00",
  },
  messagesList: {
    flex: 1,
  },
  messageContainer: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#333333",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: "#333333",
  },
  messageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  username: {
    fontWeight: "bold",
    color: "#00ffff",
    fontSize: 14,
  },
  messageText: {
    color: "#F5F2FA",
    fontSize: 16,
    lineHeight: 20,
    marginBottom: 8,
  },
  sharedLabel: {
    color: "#00AA00",
    fontSize: 14,
    fontStyle: "italic",
    marginTop: 4,
    marginBottom: 8,
  },
  messageImage: {
    width: "100%",
    maxWidth: "90%",
    height: undefined,
    aspectRatio: 4 / 3,
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center",
  },
  fileContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#222222",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333333",
    maxWidth: 600,
    alignSelf: "center",
  },
  fileIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: "#F5F2FA",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  fileType: {
    color: "#00AA00",
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: "row",
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: "#00ffff",
    backgroundColor: "#111111",
    alignItems: "center",
  },
  messageInput: {
    flex: 1,
    backgroundColor: "#130720",
    borderWidth: 2,
    borderColor: "#00ffff",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    color: "#00ffff",
    marginRight: 10,
    fontSize: 16,
  },
  messageInputDisabled: {
    borderColor: "#333333",
    color: "#666666",
  },
  sendButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 25,
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#333333",
  },
  sendButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
  uploadButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: "#333333",
    borderRadius: 25,
    justifyContent: "center",
  },
  uploadButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },
  retryButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  retryText: {
    color: "#130720",
    fontWeight: "bold",
  },
  membersButton: {
    padding: 8,
  },
  membersButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9,
    backgroundColor: "#130720",
  },
  videoCaption: {
    opacity: 0,
  },
  fileNameText: {
    opacity: 0,
  },
  adContainer: {
    backgroundColor: "#1C0A2E",
    borderLeftWidth: 4,
    borderLeftColor: "#00ffff",
    margin: 10,
    padding: 12,
    borderRadius: 8,
  },
  adHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  adBadge: {
    color: "#00ffff",
    fontSize: 12,
    fontWeight: "bold",
  },
  adContent: {},
  adTitle: {
    color: "#F5F2FA",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 4,
  },
  adDescription: {
    color: "#cccccc",
    fontSize: 14,
    marginBottom: 8,
  },
  adButton: {
    backgroundColor: "#00ffff",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  adButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 14,
  },
  adUrl: {
    color: "#888888",
    fontSize: 12,
    fontStyle: "italic",
  },
  galleryButtonText: {
    fontSize: 16,
    color: "#00ffff",
  },
  videoThumbnailContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#130720",
  },
  videoThumbnail: {
    minWidth: 200,
    minHeight: 900,
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  playIcon: {
    fontSize: 40,
  },
  videoFileName: {
    opacity: 0,
  },
  streamPlaceholder: {
    backgroundColor: "#1C0A2E",
    justifyContent: "center",
    alignItems: "center",
  },
  streamIcon: {
    fontSize: 48,
    color: "#00ffff",
    marginBottom: 8,
  },
  streamText: {
    color: "#00ffff",
    fontSize: 14,
    fontWeight: "bold",
    textAlign: "center",
  },
  streamPlayButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
  },
  streamPlayIcon: {
    fontSize: 32,
    color: "#fff",
    marginLeft: 4,
  },
  chunkedVideoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#130720",
    position: "relative",
  },
  chunkPlayButton: {
    alignItems: "center",
  },
  chunkCount: {
    color: "#fff",
    fontSize: 12,
    marginTop: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  downloadProgress: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    padding: 10,
    borderRadius: 20,
  },
  progressText: {
    color: "#00ffff",
    fontSize: 14,
    marginTop: 4,
  },
  chunkIndicator: {
    backgroundColor: "#1C0A2E",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  chunkText: {
    color: "#888",
    fontSize: 11,
  },
  inviteLinksButton: {
    backgroundColor: "#130720",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: "center",
    marginTop: 10,
  },
  inviteLinksButtonText: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  liveStreamCard: {
    backgroundColor: "#ffeded",
    padding: 12,
    borderRadius: 10,
    marginVertical: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#151159",
  },
  liveTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#151159",
    marginBottom: 4,
  },
  magnetLink: {
    fontSize: 13,
    color: "#0066cc",
    textDecorationLine: "underline",
    marginBottom: 8,
  },
  playButton: {
    backgroundColor: "#0066cc",
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  playButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  streamButton: {
    padding: 12,
    marginHorizontal: 5,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
  startStreamButton: {
    backgroundColor: "#00AA00",
  },
  stopStreamButton: {
    backgroundColor: "#FF3333",
  },
  streamButtonText: {
    color: "white",
    fontWeight: "bold",
    fontSize: 14,
  },
  floatingAdContainer: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: "#1C0A2E",
    borderRadius: 12,
    padding: 15,
    borderWidth: 2,
    borderColor: "#00ffff",
    zIndex: 1000,
  },
  closeAdButton: {
    position: "absolute",
    top: 5,
    right: 5,
    padding: 5,
  },
  closeAdText: {
    color: "#fff",
    fontSize: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 10,
    // Ensure this doesn't have a fixed height that's too small
  },
  recorderStrip: {
    width: "100%",
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#130720", // Match your theme
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
});
