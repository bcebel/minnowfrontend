
import React, { useState } from "react";
import { useWindowDimensions } from "react-native";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

// Example array of YouTube video IDs (one per channel)
const YOUTUBE_VIDEO_IDS = [
  "TG_NHr-idTA",
  "dQw4w9WgXcQ", // Example video ID 1
  "ZoWxZ8Ihf4M",
  "LfvfgLb7CtQ",
  "K4ovKtlZCEE",
  "a8Ri0rODNLk",
  "x6TtCyKwNAE",
  "4wn6GruYrSM",
  "FMU0j_ly4kk",
  "xCQXyZkMsbs",
  "WEBiebbeNCA",
  "SpS7z-laLVU",
  "p0YNFn9Dloc",
  "uEyGYjlzbA0",
  "W20feROpK1o",
  "sW4l802xphA",
  "sdbZTNKvoM8",
  "4l-P9HjdU5E",
  "3kgNy-kvFak",
  "whl05wi5KXw",
  "hOQw_J-JjJk",
  "KCJbIbySmk4",
  "k_dLVdoRhFM",
  "HL2mRKTVutM",
  "56WBs0A4Kng",
  "IkmLXvBfVv0",
  "HSJOF4ulYG8",
  "B4-L2nfGcuE",
  "Dx5qFachd3A",
  "TG_NHr-idTA",
  "dQw4w9WgXcQ", // Example video ID 1
  "ZoWxZ8Ihf4M",
  "LfvfgLb7CtQ",
  "K4ovKtlZCEE",
  "a8Ri0rODNLk",
  "ZtiAzE6nMoI",
  "x6TtCyKwNAE",
  "4wn6GruYrSM",
  "FMU0j_ly4kk",
  "xCQXyZkMsbs",
  "WEBiebbeNCA",
  "SpS7z-laLVU",
  "p0YNFn9Dloc",
  "uEyGYjlzbA0",
  "W20feROpK1o",
  "sW4l802xphA",
  "sdbZTNKvoM8",
  "4l-P9HjdU5E",
  "3kgNy-kvFak",
  "whl05wi5KXw",
  "hOQw_J-JjJk",
  "KCJbIbySmk4",
  "k_dLVdoRhFM",
  "HL2mRKTVutM",
  "56WBs0A4Kng",
  "IkmLXvBfVv0",
  "HSJOF4ulYG8",
  "B4-L2nfGcuE",
  "Dx5qFachd3A",
];

const MAX_ROWS = 30;

const App = () => {
  const [rowData, setRowData] = useState(YOUTUBE_VIDEO_IDS.slice(0, 5)); // Start with 5 rows
  const [loadingRows, setLoadingRows] = useState(false);

  const { width, height } = useWindowDimensions();

  // Simulate fetching more row data
  const loadMoreRows = () => {
    if (loadingRows) return;
    setLoadingRows(true);
    setTimeout(() => {
      if (rowData.length >= MAX_ROWS || rowData.length >= YOUTUBE_VIDEO_IDS.length) {
        setLoadingRows(false);
        return;
      }
      const newRowData = [...rowData, ...YOUTUBE_VIDEO_IDS.slice(rowData.length, rowData.length + 5)];
      setRowData(newRowData);
      setLoadingRows(false);
    }, 1000); // Simulating network request delay
  };

  return (
    <FlatList style={styles.container}
      data={rowData}
      renderItem={({ item: videoId, index }) => (
        <View style={[styles.row, { width: width, height: height}]}>
          <iframe
            width="100%"
            height="100%"
            src={`https://www.youtube.com/embed/${videoId}`}
            title={`YouTube video ${index + 1}`}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </View>
      )}
      keyExtractor={(videoId, index) => `video-${index}`}
      onEndReached={loadMoreRows} // Load more rows when reaching the end
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingRows ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
      initialNumToRender={5} // Render 5 rows initially
      maxToRenderPerBatch={3} // Render 3 additional rows per scroll batch
      windowSize={5} // Render rows within 5x the visible area
    />
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#000",
  },
  row: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    marginVertical: 5,
  },
  rowText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
});

export default App;