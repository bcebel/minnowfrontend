import React, { useState } from "react";
import { SimpleGrid } from "react-native-super-grid";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

const MAX_ROWS = 30;
const MAX_COLUMNS = 30;

const App = () => {
  const [rowData, setRowData] = useState([1, 2, 3, 4, 5]);
  const [columnData, setColumnData] = useState([1, 2, 3, 4, 5]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Simulate fetching more row data
  const loadMoreRows = () => {
    if (loadingRows) return; // Avoid multiple requests at once
    setLoadingRows(true);

    setTimeout(() => {
      if (rowData.length >= MAX_ROWS) {
        setLoadingRows(false);
        return;
      }
      const newRowData = [...rowData, rowData.length + 1];
      setRowData(newRowData);
      setLoadingRows(false);
    }); // Simulating network request delay
  };

  // Simulate fetching more column data
  const loadMoreColumns = () => {
    if (loadingColumns) return; // Avoid multiple requests at once
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

  return (
    <FlatList
      
      data={rowData}
      renderItem={({ item: row }) => (
        <View style={styles.row}>
          
          <Text style={styles.rowText}>Row {row}</Text>
          <FlatList
            data={columnData}
            renderItem={({ item: column }) => (
              <View style={styles.cell}>
                <Text>
                  Row {row}, Column {column}
                </Text>
              </View>
            )}
            keyExtractor={(column) => `row-${row}-column-${column}`}
            horizontal={true}
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
      keyExtractor={(row) => `row-${row}`}
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
    width: 300,
    height: 300,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9c2ff",
    margin: 5,
  },
});

export default App;
