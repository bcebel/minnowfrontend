import React, { useState } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";

const App = () => {
  const [data, setData] = useState([1, 2, 3, 4, 5]); // Vertical list data
  const [loading, setLoading] = useState(false);

  // Simulate fetching more data for infinite scroll
  const loadMoreData = () => {
    if (loading) return;
    setLoading(true);

    setTimeout(() => {
      const newData = [
        ...data,
        data.length + 1,
        data.length + 2,
        data.length + 3,
      ];
      setData(newData);
      setLoading(false);
    }, 1500); // Simulating network request delay
  };

  // Data for each horizontal "page"
  const horizontalData = [1, 2, 3, 4, 5];

  return (
    <FlatList
      data={data}
      renderItem={({ item }) => (
        <View style={styles.verticalItem}>
          <Text>Vertical Item {item}</Text>

          {/* Horizontal FlatList inside each vertical item */}
          <FlatList
            data={horizontalData}
            renderItem={({ item }) => (
              <View style={styles.horizontalItem}>
                <Text>Horizontal Item {item}</Text>
              </View>
            )}
            keyExtractor={(item) => item.toString()}
            horizontal={true}
            pagingEnabled={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalListContainer}
          />
        </View>
      )}
      keyExtractor={(item) => item.toString()}
      onEndReached={loadMoreData}
      onEndReachedThreshold={0.5} // Trigger load when near bottom
      ListFooterComponent={
        loading ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
    />
  );
};

const styles = StyleSheet.create({
  verticalItem: {
    padding: 20,
    marginBottom: 20,
    backgroundColor: "#f0f0f0",
    flexDirection: "column",
  },
  horizontalListContainer: {
    flexDirection: "row", // Make sure the horizontal list is arranged in a row
  },
  horizontalItem: {
    width: 300, // Width of each horizontal page
    justifyContent: "center",
    alignItems: "center",
    height: 150,
    backgroundColor: "#ddd",
    marginHorizontal: 10,
  },
});

export default App;
