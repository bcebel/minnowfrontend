import React, { useState } from "react";
import {
  FlatList,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import Scrollivision from "./scrollivision";
const App = () => {
  const [data, setData] = useState([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(false);

  // Simulate fetching more data
  const loadMoreData = () => {
    if (loading) return; // Avoid multiple requests at once
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

  return (
    <FlatList
      data={data}
      renderItem={({ item }) => (
        <View style={styles.item}>
              <Text style={styles.text}>Item {item}</Text>
              <Scrollivision />
        </View>
      )}
      keyExtractor={(item) => item.toString()}
      onEndReached={loadMoreData} // Trigger when user scrolls to the bottom
      onEndReachedThreshold={0.5} // Distance from bottom to trigger load
      ListFooterComponent={
        loading ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
    />
  );
};

const styles = StyleSheet.create({
    item: {
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#ccc",
        backgroundColor: "#f9c2ff",

    },
    text: {
        color: "#000",
    },
}
)
    ;

export default App;
