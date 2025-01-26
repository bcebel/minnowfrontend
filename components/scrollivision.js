import React, { useState } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import YT from "../app/(tabs)/YouTube";
const MAX_COLUMNS = 30;

const App = () => {
  const [data, setData] = useState([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(false);

  // Simulate fetching more data
  const loadMoreData = () => {
    if (loading) return; // Avoid multiple requests at once
    setLoading(true);

    setTimeout(() => {
      if (data.length == MAX_COLUMNS) {
        setLoading(false);
        return;
      }
      if (data.length > MAX_COLUMNS) {
        setLoading(false);
        return;
      }

      const newData = [...data, data.length + 1];
      setData(newData);
      setLoading(false);
    }); // Simulating network request delay
    console.log(data);
  };

  return (
    <FlatList
      data={data}
      renderItem={({ item }) => (
        <View style={styles.page}>
          <Text>Column {item}</Text>
        </View>
      )}
      keyExtractor={(item) => item.toString()}
      horizontal={true} // Enable horizontal scrolling
      pagingEnabled={true} // Enable paging
      onEndReached={loadMoreData} // Trigger when user scrolls to the bottom
      onEndReachedThreshold={0.5} // Distance from bottom to trigger load
      ListFooterComponent={
        loading ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
      showsHorizontalScrollIndicator={false} // Hide scroll indicator
    />
  );
};

const styles = StyleSheet.create({
  page: {
    width: 200,
    justifyContent: "center",
    alignItems: "center",
    height: 200,
    backgroundColor: "#ddd",
    marginHorizontal: 10,
  },
});

export default App;
