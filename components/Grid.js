import React, { useState } from "react";
import { SectionGrid } from "react-native-super-grid";
import { Text, ActivityIndicator, StyleSheet, View } from "react-native";


const INITIAL_DATA = [
  {
    title: "Neighborhood",
    data: [1, 2, 3, 4, 5, 6],
  },
];

const ITEMS_PER_LOAD = 5; // Number of items to load each time

function Grid() {
  const [sections, setSections] = useState(INITIAL_DATA);
  const [loading, setLoading] = useState(false);

  // Simulate loading more data
  const loadMoreData = () => {
    if (loading) return; // Prevent multiple loads
    setLoading(true);

    setTimeout(() => {
      const newSections = sections.map((section) => {
        const lastItem = section.data[section.data.length - 1];
        const newData = Array.from(
          { length: ITEMS_PER_LOAD },
          (_, i) => lastItem + i + 1
        );
        return {
          ...section,
          data: [...section.data, ...newData],
        };
      });

      setSections(newSections);
      setLoading(false);
    }, 100); // Simulate network delay
  };

  return (
    <SectionGrid
      itemDimension={130}
      sections={sections}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <Text>{item}</Text>
        </View>
      )}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionHeader}>{section.title}</Text>
      )}
      onEndReached={loadMoreData} // Trigger when user scrolls to the end
      onEndReachedThreshold={0.5} // Load more when 50% of the list is reached
      ListFooterComponent={
        loading ? <ActivityIndicator size="large" color="#0000ff" /> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  item: {
    justifyContent: "center",
    alignItems: "center",
    height: 130,
    backgroundColor: "#f9c2ff",
    borderRadius: 5,
    margin: 5,
  },
  sectionHeader: {
    fontSize: 20,
    fontWeight: "bold",
    padding: 10,
    backgroundColor: "#ddd",
  },
});

export default Grid;
