// app/neighborhood-chat.js
import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  Linking,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { gql, useQuery, useMutation } from "@apollo/client";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import AdMessage from "../../components/AdMessage";
import ChatMediaRenderer from "../../components/ChatMediaRenderer";
import WebTorrentManager from "../../components/WebTorrentManager";

const safeFileName = (asset) =>
  asset.name || asset.fileName || asset.uri.split("/").pop() || "media";
const PINATA_GATEWAY = process.env.EXPO_PUBLIC_PINATA_GATEWAY;
const getFileType = (fileName) => {
  if (!fileName) return "unknown";
  const ext = fileName.split(".").pop()?.toLowerCase();
  // 🎯 FIX: Return "video" for video extensions
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["pdf", "doc", "docx"].includes(ext)) return "document";
  // The logic in pickFile/unifiedUpload should handle images correctly
  // but if you want to explicitly check for them here:
  // if (["jpg", "jpeg", "png", "gif"].includes(ext)) return "image";
  return "unknown";
};

// Simple Video Player Component

// GraphQL Queries
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
      thumbnailUrl: $thumbnailUrl # 🆕 ADD THIS LINE
    ) {
      id
      content
      imageUrl
      videoUrl
      fileUrl
      fileName
      fileType
      magnetLink
      mimeType
      thumbnailUrl # 🆕 ADD THIS LINE
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

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Utility Functions
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

  // If it's already a full URL (http:// or https://), use it directly
  if (profilePhoto.startsWith("http")) {
    return profilePhoto;
  }

  // If it's a blob URL, use it directly (backward compatibility)
  if (profilePhoto.startsWith("blob:")) {
    return profilePhoto;
  }

  // If it's an IPFS CID (starts with Qm or bafy), construct the IPFS URL
  if (profilePhoto.startsWith("Qm") || profilePhoto.startsWith("baf")) {
    return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
  }

  // If it's just a string that doesn't match above, assume it's a CID
  return `https://${PINATA_GATEWAY}/ipfs/${profilePhoto}`;
};
const handleFilePress = async (message) => {
  try {
    if (!message.fileUrl) {
      Alert.alert("Error", "No file URL available");
      return;
    }

    // Create a proper IPFS URL
    const ipfsUrl = message.fileUrl.replace("ipfs.filebase.io", PINATA_GATEWAY);

    console.log("📥 Handling file download:", {
      fileName: message.fileName,
      fileType: message.fileType,
      ipfsUrl: ipfsUrl,
    });

    // For web - use direct download
    if (Platform.OS === "web") {
      // Create a temporary download link
      const link = document.createElement("a");
      link.href = ipfsUrl;
      link.download = message.fileName || "download";
      link.target = "_blank";

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      Alert.alert(
        "Download Started",
        `${message.fileName || "File"} download started in new tab.`
      );
    } else {
      // For mobile - show options
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
              // For React Native, you might need a clipboard library
              if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(ipfsUrl);
                Alert.alert("Success", "Link copied to clipboard!");
              } else {
                // Fallback for older browsers
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

export default function NeighborhoodChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const neighborhoodId = params.neighborhoodId;

  const scrollViewRef = useRef(null);
  const messageInputRef = useRef(null);

  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState(null);
  const [messageCount, setMessageCount] = useState(0);

  const { data: adData, refetch: fetchRandomAd } = useQuery(
    GET_RANDOM_AFFILIATE_LINK
  );
  console.log("adData:", adData);
  const TRACK_CLICK = gql`
    mutation TrackAffiliateClick($id: ID!) {
      trackAffiliateClick(id: $id)
    }
  `;
  const [trackClick] = useMutation(TRACK_CLICK);

  // GraphQL Queries
  const { data: neighborhoodData, loading: neighborhoodLoading } = useQuery(
    GET_NEIGHBORHOOD_INFO,
    {
      variables: { id: neighborhoodId },
      //      skip: !neighborhoodId,
    }
  );

  const { loading, error, data, refetch } = useQuery(
    GET_NEIGHBORHOOD_MESSAGES,
    {
      variables: { neighborhoodId },
      fetchPolicy: "cache-and-network",
      //      skip: !isAuthenticated || !neighborhoodId,
    }
  );

  const [sendMessageMutation] = useMutation(SEND_NEIGHBORHOOD_MESSAGE);

  useEffect(() => {
    // first ad on load
    fetchRandomAd();
  }, []);
  // Authentication Check
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        const savedUsername = await AsyncStorage.getItem("username");

        if (!token) {
          Alert.alert(
            "Authentication Required",
            "Please log in to access chat"
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
    };
  }, [neighborhoodId]);
  const showRandomAd = async () => {
    try {
      console.log("🔄 Fetching random affiliate ad...");
      const result = await fetchRandomAd();

      if (result.data?.randomAffiliateLink) {
        setCurrentAd(result.data.randomAffiliateLink);
        setShowAd(true);

        // Auto-hide after 30 seconds
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
      transports: ["websocket", "polling"],
    });

    newSocket.on("connect", () => {
      console.log("✅ Neighborhood socket connected");
      setSocket(newSocket);
      newSocket.emit("join-neighborhood", neighborhoodId);
    });

    newSocket.on("connect_error", (err) => {
      console.error("❌ Neighborhood socket connection error:", err);
    });

    newSocket.on("message", (newMsg) => {
      refetch();
    });

    setSocket(newSocket);
  };
  const openCamera = async () => {
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

      // 🎯 NEW: Check file size for videos
      if (type === "video" && Platform.OS === "web") {
        // Get file size
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const fileSize = blob.size;

        if (fileSize > 10 * 1024 * 1024) {
          // 10MB
          // Use chunked upload for large videos
          await uploadChunkedVideo({
            uri: asset.uri,
            name:
              asset.fileName ||
              asset.uri.split("/").pop() ||
              "camera-video.mp4",
            size: fileSize,
          });
          return;
        }
      }

      // Small files use regular upload
      await unifiedUpload(
        {
          uri: asset.uri,
          name: asset.fileName || asset.uri.split("/").pop() || "camera-media",
          size: asset.fileSize || 0,
        },
        type,
        asset.fileSize || 0,
        ""
      );
    }
  };
  // open cameraconst openCamera = async () => {
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

      // 🎯 NEW: Get file size
      let fileSize = 0;
      if (type === "video") {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        fileSize = blob.size;
      }

      const fileName =
        asset.fileName ||
        asset.uri.split("/").pop() ||
        `${type}-${Date.now()}.${type === "image" ? "jpg" : "mp4"}`;

      // Check for large videos
      if (
        type === "video" &&
        Platform.OS === "web" &&
        fileSize > 10 * 1024 * 1024
      ) {
        await uploadChunkedVideo({
          uri: asset.uri,
          name: fileName,
          size: fileSize,
        });
        return;
      }

      await unifiedUpload(
        { uri: asset.uri, name: fileName, size: fileSize },
        type,
        fileSize,
        ""
      );
    } catch (error) {
      console.error("Camera capture error:", error);
      Alert.alert("Error", "Failed to capture media");
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };
  // 🎯 Add this function in neighborhood-chat.js (near uploadChunkedVideo)
  const sendMultistreamMessage = async (
    torrent,
    sessionId,
    fileName,
    totalChunks
  ) => {
    console.log("📤 Sending multistream message...");
    console.log("Magnet URI:", torrent.magnetURI);

    // Verify magnet link
    if (!torrent.magnetURI.includes("urn:btih:")) {
      console.error("❌ Invalid magnet link:", torrent.magnetURI);
      throw new Error("Invalid magnet link generated");
    }

    try {
      await sendMessageMutation({
        variables: {
          content: `🎯 MULTISTREAM Torrent: ${totalChunks} chunks in one link`,
          neighborhoodId: neighborhoodId,
          fileName: `${fileName} (Multistream)`,
          fileType: "video_multistream",
          magnetLink: torrent.magnetURI,
          sessionId: sessionId,
          totalChunks: totalChunks,
          imageUrl: null,
          videoUrl: null,
          fileUrl: null,
          thumbnailUrl: null,
        },
      });

      console.log("✅ Multistream message sent!");

      // Monitor seeding
      console.log("🌱 Now seeding:", torrent.name);
      console.log("📊 Initial stats:", {
        files: torrent.files.length,
        fileNames: torrent.files.map((f) => f.name),
        fileSizes: torrent.files.map((f) => f.length),
        ready: torrent.ready,
        peers: torrent.numPeers,
      });

      return torrent.magnetURI;
    } catch (error) {
      console.error("❌ Failed to send multistream message:", error);
      throw error;
    }
  };

  // 🎯 ADD THIS FUNCTION SOMEWHERE IN YOUR FILE:
  const uploadChunkedVideo = async (asset) => {
    console.log("🚀 uploadChunkedVideo called for:", asset.name);

    const response = await fetch(asset.uri);
    const blob = await response.blob();

    const CHUNK_SIZE = 2 * 1024 * 1024;
    const totalChunks = Math.ceil(blob.size / CHUNK_SIZE);
    const sessionId = `video_${Date.now()}`;

    // Create files
    const chunkFiles = [];
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, blob.size);
      const chunkBlob = blob.slice(start, end, "video/mp4");
      const chunkFile = new File([chunkBlob], `chunk_${i}.mp4`, {
        type: "video/mp4",
        lastModified: Date.now(),
      });
      chunkFiles.push(chunkFile);
    }

    console.log("✅ Created", chunkFiles.length, "chunk files");

    // Use the global client
    const client = window.globalWebTorrentClient;

    return new Promise((resolve) => {
      client.seed(
        chunkFiles,
        {
          name: `${sessionId}_multistream`,
          announce: window.enhancedTrackers,
        },
        (torrent) => {
          console.log("✅ Torrent created with files:", torrent.files.length);

          // Send message
          sendMessageMutation({
            variables: {
              content: `🎬 Video (${totalChunks} chunks)`,
              neighborhoodId: neighborhoodId,
              fileName: asset.name || "video.mp4",
              fileType: "video_multistream",
              magnetLink: torrent.magnetURI,
              sessionId: sessionId,
              totalChunks: totalChunks,
              thumbnailUrl: null, // You can add thumbnail later
            },
          }).then(() => {
            console.log("✅ Message sent!");
            resolve();
          });
        }
      );
    });
  };

  const debugForceSeed = async () => {
    // Get a magnet link from your chat
    const magnetUri =
      "magnet:?xt=urn:btih:3a9cb5f4fa3df2129ceae0bfd833c452deede717&dn=video_1764910082359_2mlo99wje_multis";

    console.log("🔧 Force seeding existing torrent...");

    if (!window.WebTorrent) {
      const script = document.createElement("script");
      script.src =
        "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
      document.head.appendChild(script);
      await new Promise((resolve) => (script.onload = resolve));
    }

    // Create client that WON'T be destroyed
    if (!window.debugSeeder) {
      window.debugSeeder = new window.WebTorrent();
      console.log("🌐 Created debug seeder");
    }

    const client = window.debugSeeder;

    // First download the torrent (so we have files)
    client.add(magnetUri, (torrent) => {
      console.log("📥 Downloaded torrent, now seeding...");
      console.log(
        "Torrent files:",
        torrent.files.map((f) => f.name)
      );

      // The torrent automatically seeds after download
      // But we need to keep the client alive

      // Monitor
      setInterval(() => {
        console.log("🌱 Seeding:", {
          peers: torrent.numPeers,
          progress: torrent.progress,
          uploaded: torrent.uploaded,
        });
      }, 5000);

      Alert.alert(
        "Seeding Started",
        "Now try downloading from another browser!"
      );
    });
  };

  // Add this button somewhere in your UI

  // Send Message
  const sendMessage = async () => {
    if (!newMessage.trim() || !socket) return;

    const messageContent = newMessage.trim();
    setNewMessage("");

    try {
      await sendMessageMutation({
        variables: {
          content: messageContent,
          neighborhoodId: neighborhoodId,
        },
      });
      console.log("✅ Neighborhood message sent");

      setTimeout(() => {
        messageInputRef.current?.focus();
      }, 100);
    } catch (err) {
      console.error("❌ Send message error:", err);
      Alert.alert("Error", "Failed to send message");
      setNewMessage(messageContent);
    }
  };

  // In pickImage function
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        quality: 0.8,
      });

      if (!result.canceled) {
        const asset = result.assets[0];
        const type = asset.type === "image" ? "image" : "video";

        // 🎯 NEW: Get file size for videos
        let fileSize = asset.fileSize || 0;

        if (type === "video" && Platform.OS === "web" && !fileSize) {
          // Get size from blob if not provided
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          fileSize = blob.size;
        }

        // Check if large video
        if (
          type === "video" &&
          Platform.OS === "web" &&
          fileSize > 10 * 1024 * 1024
        ) {
          await uploadChunkedVideo({
            uri: asset.uri,
            name: safeFileName(asset),
            size: fileSize,
          });
          return;
        }

        await unifiedUpload(
          { ...asset, name: safeFileName(asset), size: fileSize },
          type,
          fileSize,
          ""
        );
      }
    } catch (error) {
      Alert.alert("Error", "Failed to pick media");
    }
  };

  // Simple toggle in pickFile:
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        const file = result.assets[0];

        // 🎯 IMPORTANT: Get the actual file size
        const response = await fetch(file.uri);
        const blob = await response.blob();
        const fileSize = blob.size;

        console.log("📁 File selected:", {
          name: file.name,
          size: fileSize,
          type: file.mimeType,
        });

        if (fileSize > 10 * 1024 * 1024 && Platform.OS === "web") {
          Alert.alert(
            "Large Video",
            "Upload as chunked P2P video (faster for neighbors)?",
            [
              {
                text: "Regular Upload",
                onPress: async () => {
                  // 🎯 Use chunked ANYWAY since IPFS is failing!
                  console.log("IPFS failing, forcing chunked upload");
                  await uploadChunkedVideo(file);
                },
              },
              {
                text: "Chunked P2P",
                onPress: async () => {
                  await uploadChunkedVideo(file);
                },
              },
            ]
          );
        } else {
          // For small files, try IPFS but fallback to chunked
          try {
            await unifiedUpload(file, "video", fileSize, file.mimeType);
          } catch (error) {
            console.log("IPFS failed, falling back to chunked");
            await uploadChunkedVideo(file);
          }
        }
      }
    } catch (error) {
      console.error("File picker error:", error);
      Alert.alert("Error", "Failed to pick file");
    }
  };

  // SIMPLE Upload - JUST STORE WHAT WE GET
  const unifiedUpload = async (asset, type, fileSize, mimeType) => {
    setUploading(true);
    setUploadType(type);

    try {
      const token = await AsyncStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      // 🎯 CRITICAL FIX: Check fileSize parameter!
      // Some calls might pass 0 or undefined, so we need to fetch it
      let actualFileSize = fileSize;
      if (
        (type === "video" || type === "image") &&
        (!fileSize || fileSize === 0) &&
        Platform.OS === "web"
      ) {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        actualFileSize = blob.size;
      }

      // 🎯 Use chunking for videos > 5MB on web
      if (
        type === "video" &&
        Platform.OS === "web" &&
        actualFileSize > 5 * 1024 * 1024
      ) {
        console.log("📦 Using chunked upload for large video:", actualFileSize);
        await uploadChunkedVideo(asset);
        return;
      }

      let fileUri = asset.uri;
      let fileName = asset.name || asset.fileName || `file-${Date.now()}`;

      console.log("🔄 Upload with thumbnail generation:", { fileName, type });

      // Upload to IPFS WITH THUMBNAIL
      const { ipfsUrl, magnetLink, thumbnailUrl } = await uploadToIPFS(
        fileUri,
        fileName,
        type,
        token,
        neighborhoodId
      );
      console.log("🎯 Received from uploadToIPFS:", {
        thumbnailUrl,
        hasThumbnail: !!thumbnailUrl,
      });

      if (ipfsUrl) {
        // Include thumbnailUrl in message variables
        const messageVariables = {
          content: `Shared: ${fileName}`,
          neighborhoodId: neighborhoodId,
          fileName,
          fileType: type,
          magnetLink: magnetLink || null,
          thumbnailUrl: thumbnailUrl || null, // 🆕 Add thumbnail URL
        };

        // Store in appropriate field
        if (type === "image") {
          messageVariables.imageUrl = ipfsUrl;
        } else if (type === "video") {
          messageVariables.videoUrl = ipfsUrl;
        } else {
          messageVariables.fileUrl = ipfsUrl;
        }

        console.log("📤 Sending message with thumbnail:", messageVariables);
        await sendMessageMutation({ variables: messageVariables });
        console.log(`✅ ${type} uploaded successfully with thumbnail`);
      }
    } catch (error) {
      console.error(`❌ Upload error:`, error);
      Alert.alert("Upload Failed", error.message);
    } finally {
      setUploading(false);
      setUploadType(null);
    }
  };

  const seedMultistreamWithValidation = async (
    chunkFiles,
    sessionId,
    fileName,
    totalChunks
  ) => {
    console.log("🌱 Seeding with validation...");

    // Validate files before seeding
    chunkFiles.forEach((file, i) => {
      if (!(file instanceof File)) {
        console.error(`❌ Chunk ${i} is not a File object:`, file);
      }
      if (file.size === 0) {
        console.error(`❌ Chunk ${i} is empty (0 bytes):`, file.name);
      }
    });

    const client = window.globalWebTorrentClient;

    return new Promise((resolve, reject) => {
      console.log("🔧 WebTorrent seeding options:", {
        name: `${sessionId}_multistream`,
        fileCount: chunkFiles.length,
        totalSize: chunkFiles.reduce((sum, f) => sum + f.size, 0),
      });

      client.seed(
        chunkFiles,
        {
          name: `${sessionId}_multistream`,
          announce: window.enhancedTrackers || [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.files.fm:7073/announce",
          ],
        },
        (torrent) => {
          console.log("🎯 Torrent callback fired!");

          // Check torrent immediately
          console.log("📊 Immediate torrent check:");
          console.log("Files length:", torrent.files.length);
          console.log("Files:", torrent.files);
          console.log("Torrent name:", torrent.name);
          console.log("Info hash:", torrent.infoHash);

          if (torrent.files.length === 0) {
            console.error("❌ ERROR: Torrent created with 0 files!");
            console.error("Chunk files provided:", chunkFiles);
            console.error(
              "Chunk file types:",
              chunkFiles.map((f) => ({
                constructor: f.constructor.name,
                type: typeof f,
                isFile: f instanceof File,
                isBlob: f instanceof Blob,
              }))
            );
            reject(new Error("Torrent has no files"));
            return;
          }

          // Wait for torrent to be ready
          const checkReady = () => {
            if (torrent.ready) {
              console.log("✅ Torrent is READY!");
              console.log(
                "Files in ready torrent:",
                torrent.files.map((f) => ({
                  name: f.name,
                  length: f.length,
                  path: f.path,
                }))
              );

              // Now send the magnet link
              sendMultistreamMessage(torrent, sessionId, fileName, totalChunks)
                .then(resolve)
                .catch(reject);
            } else {
              console.log("⏳ Waiting for torrent to be ready...");
              setTimeout(checkReady, 500);
            }
          };

          checkReady();
        }
      );

      // Handle seeding errors
      client.on("error", (err) => {
        console.error("❌ WebTorrent seeding error:", err);
        reject(err);
      });
    });
  };
  // 🎯 ADD THIS FUNCTION - It's MISSING!

  const createMultistreamTorrent = async (
    chunkFiles,
    sessionId,
    fileName,
    totalChunks,
    thumbnailUrl
  ) => {
    return new Promise((resolve, reject) => {
      console.log("🌐 Using global WebTorrent client...");

      // ✅ USE THE GLOBAL CLIENT!
      if (!window.globalWebTorrentClient) {
        console.error("❌ Global WebTorrent client not found!");
        reject(new Error("WebTorrent not initialized"));
        return;
      }

      const client = window.globalWebTorrentClient;

      // Check if already seeding this torrent
      const existingTorrent = client.torrents.find((t) =>
        t.name.includes(sessionId)
      );

      if (existingTorrent) {
        console.log(
          "✅ Already seeding this torrent:",
          existingTorrent.magnetURI
        );
        resolve(existingTorrent.magnetURI);
        return;
      }

      console.log("🌱 Seeding new multistream...");
      console.log(
        "Chunk files:",
        chunkFiles.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        }))
      );

      client.seed(
        chunkFiles,
        {
          name: `${sessionId}_multistream`,
          announce: window.enhancedTrackers || [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.files.fm:7073/announce",
          ],
        },
        (torrent) => {
          console.log("✅ Torrent seeded via global client!");
          console.log("📊 Torrent info:", {
            name: torrent.name,
            infoHash: torrent.infoHash,
            files: torrent.files.map((f) => f.name),
            clientTorrents: client.torrents.length,
          });

          // Monitor seeding
          torrent.on("wire", (wire, addr) => {
            console.log("🔗 Connected to peer:", addr);
          });

          torrent.on("upload", (bytes) => {
            console.log("⬆️ Uploaded", bytes, "bytes");
          });

          // Send message
          sendMessageMutation({
            variables: {
              content: `🎯 MULTISTREAM Torrent: ${totalChunks} chunks`,
              neighborhoodId: neighborhoodId,
              fileName: `${fileName} (Multistream)`,
              fileType: "video_multistream",
              magnetLink: torrent.magnetURI,
              sessionId: sessionId,
              totalChunks: totalChunks,
              thumbnailUrl: thumbnailUrl,
            },
          }).then(() => {
            console.log("✅ Message sent. Global client keeps seeding!");
            resolve(torrent.magnetURI);
          });
        }
      );

      // Handle errors
      client.on("error", (err) => {
        console.error("❌ Global WebTorrent error:", err);
        reject(err);
      });
    });
  };

  // Helper
  function formatBytes(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  // Helper function
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

  // Helper function for MIME types
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

  const generateThumbnail = async (videoUrl) => {
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

          // 🎯 FIX: Use the reliable toDataURL() instead of convertToBlob()
          // We convert directly to a base64 JPEG, which is widely supported.
          const base64 = canvas.toDataURL("image/jpeg", 0.8); // 0.8 is quality

          // Optionally, you can log the size estimate, though not exact blob size
          const sizeEstimate = base64.length * (3 / 4) - 2;

          console.log(
            `📸 Thumbnail ready: JPEG (via DataURL), ~${sizeEstimate.toFixed(
              0
            )} bytes`
          );

          resolve({
            // We are returning a base64 string directly, no need for blob
            base64,
            format: "jpeg", // Update format
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

      // Set timeout
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
    neighborhoodId
  ) => {
    try {
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const formData = new FormData();
      formData.append("video", blob, fileName);
      formData.append("title", fileName);
      formData.append("description", `Uploaded ${type} - ${fileName}`);

      if (neighborhoodId) {
        formData.append("neighborhoodId", neighborhoodId);
      }

      console.log("📤 IPFS Upload:", {
        fileName,
        type,
        size: blob.size,
        neighborhoodId,
      });

      const res = await fetch(`${BACKEND_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      console.log("📥 upload response status:", res.status);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`IPFS upload failed: ${res.status} – ${errorText}`);
      }

      const result = await res.json();
      const { ipfsUrl, magnetLink } = result;

      console.log("✅ IPFS Result:", { ipfsUrl, magnetLink });

      // 🎯 AVIF THUMBNAIL GENERATION// In uploadToIPFS function:
      let thumbnailUrl = null;

      if (type === "video") {
        try {
          console.log("🎬 Starting thumbnail generation for video...");

          const { base64, format, size } = await generateThumbnail(fileUri);

          console.log(
            `✅ ${format.toUpperCase()} thumbnail generated: ${size} bytes`
          );
          thumbnailUrl = base64;
        } catch (thumbnailError) {
          console.error(
            "❌ Thumbnail generation failed completely:",
            thumbnailError.message
          );
          // Continue without thumbnail
        }
      }

      console.log("📊 Final return values:", {
        ipfsUrl,
        magnetLink,
        thumbnailUrl,
        hasThumbnail: !!thumbnailUrl,
      });

      // ✅ Always return from here (for all file types)
      return {
        ipfsUrl,
        magnetLink,
        thumbnailUrl,
      };
    } catch (error) {
      console.error("❌ IPFS upload error:", error);
      throw error;
    }
  };

  const captureStreamThumbnail = (videoElement) => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext("2d");

      // Wait for video to have data
      if (videoElement.readyState >= 2) {
        ctx.drawImage(videoElement, 0, 0, 320, 240);
        const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
        resolve(thumbnailUrl);
      } else {
        videoElement.onloadeddata = () => {
          ctx.drawImage(videoElement, 0, 0, 320, 240);
          const thumbnailUrl = canvas.toDataURL("image/jpeg", 0.8);
          resolve(thumbnailUrl);
        };
      }
    });
  };
  const startNeighborhoodLiveStream = async () => {
    try {
      console.log("🔴 Starting TRUE live stream...");

      if (Platform.OS !== "web") {
        Alert.alert("Web Only", "Live streaming requires web browser");
        return;
      }

      // Get camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: true,
      });

      // Show preview
      const preview = document.createElement("video");
      preview.srcObject = stream;
      preview.autoplay = true;
      preview.muted = true;
      preview.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 200px; 
      z-index: 1000; border: 2px solid #ff0000; border-radius: 8px;
    `;
      document.body.appendChild(preview);

      // Load WebTorrent
      if (!window.WebTorrent) {
        const script = document.createElement("script");
        script.src =
          "https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js";
        document.head.appendChild(script);
        await new Promise((resolve) => (script.onload = resolve));
      }

      const client = new window.WebTorrent();

      // 🎯 CRITICAL: Create a readable stream from MediaStream
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "video/webm; codecs=vp8,opus",
        videoBitsPerSecond: 1000000, // 1 Mbps
      });

      // Buffer for live chunks
      let chunkBuffer = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunkBuffer.push(event.data);
        }
      };

      mediaRecorder.start(1000); // Get chunks every second

      // Create a custom readable stream
      const liveStream = new ReadableStream({
        start(controller) {
          console.log("📡 Live stream controller started");
          // Push chunks as they arrive
          const pushChunks = () => {
            if (chunkBuffer.length > 0) {
              const chunk = chunkBuffer.shift();
              controller.enqueue(chunk);
            }
            setTimeout(pushChunks, 100);
          };
          pushChunks();
        },
        cancel() {
          console.log("📡 Live stream cancelled");
          mediaRecorder.stop();
        },
      });

      // Convert to WebTorrent-friendly format
      const webStream = {
        name: `live-stream-${Date.now()}.webm`,
        size: Infinity, // Live streams have unknown size
        createReadStream: () => liveStream.getReader(),
      };

      console.log("🌐 Seeding LIVE stream...");

      // 🎯 SEED AS LIVE STREAM
      const torrent = client.seed(
        webStream,
        {
          announce: [
            "wss://tracker.openwebtorrent.com",
            "wss://tracker.btorrent.xyz",
            "wss://tracker.files.fm:7073/announce",
          ],
          // 🚨 EXPERIMENTAL: Live streaming options
          // private: true, // Don't share with DHT (better for live)
        },
        (torrent) => {
          console.log("✅ LIVE torrent created:", torrent.magnetURI);

          // 🎯 POST TO CHAT IMMEDIATELY
          const liveMessage = `🔴 **LIVE STREAM STARTED!**\n\nJoin the P2P live stream:\n\`${torrent.magnetURI}\`\n\nViewers: 0`;

          sendMessageMutation({
            variables: {
              content: liveMessage,
              neighborhoodId: neighborhoodId,
              fileName: "LIVE_STREAM.webm",
              fileType: "video",
              magnetLink: torrent.magnetURI,
              mimeType: "video/webm",
              thumbnailUrl: null,
            },
          }).then(() => {
            console.log("✅ Live stream announcement posted!");

            // Update viewer count periodically
            let viewerCount = 0;
            const updateViewers = () => {
              viewerCount = torrent.numPeers;
              console.log(`👥 Viewers: ${viewerCount}`);

              // Could update message with viewer count
              // This would require message editing capability
            };

            setInterval(updateViewers, 5000);

            // Show controls
            showStreamControls(torrent, stream, preview);
          });
        }
      );

      // Handle errors
      client.on("error", (err) => {
        console.error("❌ WebTorrent error:", err);
        Alert.alert("Stream Error", err.message);
      });
    } catch (error) {
      console.error("❌ Live stream error:", error);
      Alert.alert("Stream Error", error.message);
    }
  };

  // 🎯 Stream controls UI
  const showStreamControls = (torrent, stream, preview) => {
    const controls = document.createElement("div");
    controls.style.cssText = `
    position: fixed; top: 220px; right: 10px; 
    background: rgba(0,0,0,0.8); color: white;
    padding: 15px; border-radius: 8px; z-index: 1001;
    border: 2px solid #ff0000;
  `;

    controls.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold; color: #ff0000;">
      🔴 LIVE STREAMING
    </div>
    <div style="margin-bottom: 5px; font-size: 12px;">
      Seeders: <span id="seeders">1</span> | 
      Peers: <span id="peers">0</span>
    </div>
    <div style="display: flex; gap: 10px;">
      <button id="stopStream" style="
        background: #ff4444; color: white; border: none;
        padding: 8px 15px; border-radius: 4px; cursor: pointer;
      ">Stop Stream</button>
    </div>
  `;

    document.body.appendChild(controls);

    // Update stats
    const updateStats = () => {
      document.getElementById("seeders").textContent = torrent.numPeers;
      document.getElementById("peers").textContent = torrent.wires.length;
    };
    setInterval(updateStats, 2000);

    // Stop button
    document.getElementById("stopStream").onclick = () => {
      stream.getTracks().forEach((track) => track.stop());
      document.body.removeChild(preview);
      document.body.removeChild(controls);

      // Post end message
      sendMessageMutation({
        variables: {
          content: "⏹️ **LIVE STREAM ENDED**",
          neighborhoodId: neighborhoodId,
        },
      });

      Alert.alert("Stream Ended", "Live stream stopped successfully");
    };
  };

  const testAd = {
    url: "https://www.tkqlhce.com/click-101316119-15402725", // Replace with your actual CJ.com affiliate link
    title: "Test Ad",
    id: "test-1",
  };
  // Render Logic
  const messages = data?.neighborhoodMessages || [];
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
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebTorrentManager />
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/neighborhood-gallery?neighborhoodId=${neighborhoodId}`
            )
          }
          style={styles.galleryButton}
        >
          <Text style={styles.galleryButtonText}> 🖼 GALLERY 🖼️</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={debugForceSeed}>
          <Text>🔧 Force Seed Test</Text>
        </TouchableOpacity>
        <Text style={styles.roomTitle}>🏘️ {neighborhoodName}</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(
              `/neighborhood-members?neighborhoodId=${neighborhoodId}`
            )
          }
          style={styles.membersButton}
        >
          <Text style={styles.membersButtonText}>👥</Text>
        </TouchableOpacity>
      </View>
      {!socket && (
        <View style={styles.connectionWarning}>
          <Text style={styles.warningText}>Connecting...</Text>
        </View>
      )}

      <ScrollView style={styles.messagesList} ref={scrollViewRef}>
        {messages.map((item, index) => {
          // 🟢 ADD NULL CHECK HERE TOO
          if (!item) return null;

          const showAdHere = index % 20 === 0;
          return (
            <React.Fragment key={item.id}>
              {/* Regular message first */}
              <View style={styles.messageContainer}>
                <Image
                  source={{
                    uri: getProfilePhotoUrl(item.sender?.profilePhoto),
                  }}
                  style={styles.profileImage}
                />
                <View style={styles.messageContent}>
                  <Text style={styles.username}>
                    {item.sender?.username || "Unknown"}
                  </Text>

                  {/* 🟢 Ensure item is passed */}
                  <ChatMediaRenderer message={item} />

                  {!item.imageUrl && !item.videoUrl && !item.fileUrl && (
                    <Text style={styles.messageText}>{item.content}</Text>
                  )}

                  <Text style={styles.timestamp}>
                    {formatTimestamp(item.createdAt)}
                  </Text>
                </View>
              </View>

              {/* ... rest ... */}
            </React.Fragment>
          );
        })}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.uploadButton} onPress={pickFile}>
          <Text style={styles.uploadButtonText}>📎</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.uploadButton} onPress={openCamera}>
          <Text style={styles.uploadButtonText}>📷</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.streamButton}
          onPress={startNeighborhoodLiveStream}
          disabled={uploading}
        >
          <Text style={styles.streamButtonText}>{uploading ? "🔄" : "🎥"}</Text>
        </TouchableOpacity>
      </View>
      <View>
        <TextInput
          ref={messageInputRef}
          style={[styles.messageInput, !socket && styles.messageInputDisabled]}
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "flex-start",
    backgroundColor: "#000000",
    padding: 5,
  },
  loadingText: {
    color: "#00ffff",
    marginTop: 10,
    fontSize: 16,
  },
  errorText: {
    color: "#FF4444",
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
  messageContent: {
    flex: 1,
  },
  username: {
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
    fontSize: 14,
  },
  messageText: {
    color: "#FFFFFF",
    marginBottom: 8,
    fontSize: 16,
    lineHeight: 20,
  },
  timestamp: {
    fontSize: 11,
    color: "#00AA00",
    opacity: 0.7,
  },
  // LARGER MEDIA STYLES
  messageImage: {
    width: "100%", // Will be controlled by parent
    maxWidth: "90%", // Maximum size on large screens
    height: undefined,
    aspectRatio: 4 / 3, // Maintain aspect ratio
    borderRadius: 12,
    marginBottom: 8,
    alignSelf: "center", // Center the media
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
    maxWidth: 600, // Limit file container width
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
    color: "#FFFFFF",
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
    backgroundColor: "#000000",
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
    color: "#000000",
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
    color: "#000000",
    fontWeight: "bold",
  },
  membersButton: {
    padding: 8,
  },
  membersButtonText: {
    fontSize: 18,
    color: "#00ffff",
  },
  streamButton: {
    padding: 12,
    marginRight: 10,
    backgroundColor: "#FF4444",
    borderRadius: 25,
    justifyContent: "center",
  },
  streamButtonText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  // LARGER VIDEO PLAYER STYLES
  videoContainer: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%", // Full width of message container
    maxWidth: 800, // Maximum size on large screens
    alignSelf: "center", // Center in message
  },
  videoPlayer: {
    width: "100%",
    height: undefined,
    aspectRatio: 16 / 9, // Standard video aspect ratio
    backgroundColor: "#000",
  },
  videoCaption: {
    opacity: 0,
  },
  fileNameText: {
    opacity: 0,
  },
  adContainer: {
    backgroundColor: "#1a1a1a",
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
  adContent: {
    // Your ad content styles
  },
  adTitle: {
    color: "#ffffff",
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
    color: "#000000",
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
    backgroundColor: "#000",
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
  // Add to your StyleSheet:
  streamPlaceholder: {
    backgroundColor: "#1a1a1a",
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
    backgroundColor: "rgba(255, 0, 0, 0.8)", // Red for "live"
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
    backgroundColor: "#000",
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
    backgroundColor: "#1a1a1a",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  chunkText: {
    color: "#888",
    fontSize: 11,
  },
});
