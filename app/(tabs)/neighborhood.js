import React, { useState } from "react";
import { useWindowDimensions } from "react-native";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from "react-native";

// Example array of YouTube video IDs (ensure it has enough unique IDs)
const YOUTUBE_VIDEO_IDS = [
  "TG_NHr-idTA",
  "dQw4w9WgXcQ", // Example video ID 1
  "ZoWxZ8Ihf4M",
  "K4ovKtlZCEE",
  "a8Ri0rODNLk",
  "uEyGYjlzbA0",
  "ZtiAzE6nMoI",
  "x6TtCyKwNAE",
  "xCQXyZkMsbs",
  "WEBiebbeNCA",
  "SpS7z-laLVU",
  "p0YNFn9Dloc",
  "M7lc1UVf-VE", // Example video ID 2
  "KMU0tzLwhbE", // Example video ID 3
  "eI4an8aSsgw", // Example video ID 4
  "uEyGYjlzbA0",
  "ZtiAzE6nMoI",
  "x6TtCyKwNAE",
  "xCQXyZkMsbs",
  "WEBiebbeNCA",
  "SpS7z-laLVU",
  "W20feROpK1o",
  "sW4l802xphA",
  "sdbZTNKvoM8",
  "4l-P9HjdU5E",
  "3kgNy-kvFak",
  "whl05wi5KXw",
  "hOQw_J-JjJk",
  "dQw4w9WgXcQ", // Example video ID 1
  "M7lc1UVf-VE", // Example video ID 2
  "KMU0tzLwhbE", // Example video ID 3
  "eI4an8aSsgw", // Example video ID 4
  // Add more video IDs as needed

  "KCJbIbySmk4",
  "k_dLVdoRhFM",
  "HL2mRKTVutM",
  "56WBs0A4Kng",
  "IkmLXvBfVv0",
  "HSJOF4ulYG8",
  "B4-L2nfGcuE",
  "Dx5qFachd3A", // Example video ID 5
  // Add more video IDs as needed
];

const MAX_ROWS = 30;
const MAX_COLUMNS = 30;

const App = () => {
  const [rowData, setRowData] = useState([1, 2, 3, 4, 5]);
  const [columnData, setColumnData] = useState([1, 2, 3, 4, 5]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const { width, height } = useWindowDimensions();

  // Simulate fetching more row data
  const loadMoreRows = () => {
    if (loadingRows) return;
    setLoadingRows(true);
    setTimeout(() => {
      if (rowData.length >= MAX_ROWS) {
        setLoadingRows(false);
        return;
      }
      const newRowData = [...rowData, rowData.length + 1];
      setRowData(newRowData);
      setLoadingRows(false);
    }, 1000); // Simulating network request delay
  };

  // Simulate fetching more column data
  const loadMoreColumns = () => {
    if (loadingColumns) return;
    setLoadingColumns(true);
    setTimeout(() => {
      if (columnData.length >= MAX_COLUMNS) {
        setLoadingColumns(false);
        return;
      }
      const newColumnData = [...columnData, columnData.length + 1];
      setColumnData(newColumnData);
      setLoadingColumns(false);
    }, 1000); // Simulating network request delay
  };

  // Function to get a unique video ID based on row and column
  const getVideoId = (rowIndex, colIndex) => {
    const index = rowIndex * columnData.length + colIndex;
    if (index < YOUTUBE_VIDEO_IDS.length) {
      return YOUTUBE_VIDEO_IDS[index];
    }
    return null; // Return null if no video ID is available
  };

  return (
    <FlatList
      data={rowData}
      renderItem={({ item: row, index: rowIndex }) => (
        <View style={styles.row}>
          <Text style={styles.rowText}>Row {row}</Text>
          <FlatList
            data={columnData}
            renderItem={({ item: column, index: colIndex }) => {
              const videoId = getVideoId(rowIndex, colIndex);
              return (
                <View
                  style={[
                    styles.cell,
                    { width: width - 10, height: height - 100 },
                  ]}
                >
                  {videoId ? (
                    <iframe
                      width="100%"
                      height="100%"
                      src={`https://www.youtube.com/embed/${videoId}`}
                      title={`YouTube video for Row ${row}, Column ${column}`}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <Text>No video available</Text>
                  )}
                </View>
              );
            }}
            keyExtractor={(column, colIndex) => `row-${row}-column-${colIndex}`}
            horizontal={true}
            pagingEnabled={true}
            onEndReached={loadMoreColumns}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingColumns ? (
                <ActivityIndicator size="small" color="#0000ff" />
              ) : null
            }
            showsHorizontalScrollIndicator={false}
          />
        </View>
      )}
      keyExtractor={(row, rowIndex) => `row-${rowIndex}`}
      onEndReached={loadMoreRows}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingRows ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
    />
  );
};

const styles = StyleSheet.create({
  row: {
    padding: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  rowText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  cell: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9c2ff",
    margin: 5,
  },
});

export default App;
