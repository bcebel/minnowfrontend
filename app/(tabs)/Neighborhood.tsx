import React, { useState, useRef } from "react";
import { useWindowDimensions } from "react-native";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Image,
  TouchableOpacity,
} from "react-native";

// Example array of member data
const MEMBERS = Array.from({ length: 100 }, (_, i) => ({
  id: i + 1,
  name: `User${i + 1}`,
  bio: `Short bio for User${i + 1}.`,
  avatar: `https://i.pravatar.cc/150?img=${i + 1}`, // Random avatar generator
  links: ["https://example.com", "https://twitter.com"],
}));

const MAX_ROWS = 30;
const MAX_COLUMNS = 30;

const App = () => {
  const [rowData, setRowData] = useState([1, 2, 3, 4, 5]); // Start with 5 rows
  const [columnData, setColumnData] = useState([1, 2, 3, 4, 5]); // Start with 5 columns
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

  // Get a unique member based on row and column indices
  const getMember = (rowIndex, colIndex) => {
    const index = rowIndex * MAX_COLUMNS + colIndex;
    if (index < MEMBERS.length) {
      return MEMBERS[index];
    }
    return null; // Return null if no member is available
  };

  // Render a single member card
  const renderMemberCard = (member) => (
    <View style={[styles.card, { width: width - 20, height: height / 3 }]}>
      {/* Profile Photo */}
      <Image source={{ uri: member.avatar }} style={styles.avatar} />
      {/* Name */}
      <Text style={styles.name}>{member.name}</Text>
      {/* Bio */}
      <Text style={styles.bio} numberOfLines={3}>
        {member.bio}
      </Text>
      {/* Links */}
      <View style={styles.linksContainer}>
        {member.links.map((link, index) => (
          <TouchableOpacity
            key={index}
            onPress={() => console.log(`Opening link: ${link}`)}
          >
            <Text style={styles.link}>🔗 Link {index + 1}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Passport Stamp Decoration */}
      <View style={styles.stamp}>
        <Text style={styles.stampText}>PASSPORT</Text>
      </View>
    </View>
  );

  return (
    <FlatList
      data={rowData}
      renderItem={({ item: row, index: rowIndex }) => (
        <View style={styles.row}>
          <Text style={styles.rowText}>Row {row}</Text>
          <FlatList
            data={columnData}
            renderItem={({ item: column, index: colIndex }) => {
              const member = getMember(rowIndex, colIndex);
              return member ? (
                renderMemberCard(member)
              ) : (
                <Text>No member available</Text>
              );
            }}
            keyExtractor={(column, colIndex) => `row-${row}-column-${colIndex}`}
            horizontal={true}
            pagingEnabled={true}
            showsHorizontalScrollIndicator={false}
            initialNumToRender={3} // Render only 3 columns initially
            maxToRenderPerBatch={2} // Render 2 additional columns per scroll batch
            windowSize={5} // Render items within 5x the visible area
            onEndReached={loadMoreColumns} // Load more columns when reaching the end
            onEndReachedThreshold={0.5}
          />
        </View>
      )}
      keyExtractor={(row, rowIndex) => `row-${rowIndex}`}
      initialNumToRender={5} // Render only 5 rows initially
      maxToRenderPerBatch={2} // Render 2 additional rows per scroll batch
      windowSize={5} // Render rows within 5x the visible area
      onEndReached={loadMoreRows} // Load more rows when reaching the end
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        loadingRows ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
    />
  );
};

const styles = StyleSheet.create({
  row: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#ccc",
  },
  rowText: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  card: {
    margin: 5,
    padding: 10,
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ddd",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 5,
  },
  bio: {
    fontSize: 12,
    textAlign: "center",
    color: "#555",
    marginBottom: 10,
  },
  linksContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  link: {
    fontSize: 12,
    color: "#007bff",
    marginHorizontal: 5,
  },
  stamp: {
    position: "absolute",
    top: 10,
    right: 10,
    backgroundColor: "#ffcc00",
    padding: 5,
    borderRadius: 5,
    transform: [{ rotate: "15deg" }],
  },
  stampText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#fff",
  },
});

export default App;
