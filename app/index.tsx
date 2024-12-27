
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";


export default function Index() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("https://minnowspacebackend-e6635e46c3d0.herokuapp.com/api") // Replace with your backend URL
      .then((response) => response.json())
      .then((data) => setMessage(data.message))
      .catch((error) => console.error(error));
  }, []);

  return (
    <View style={styles.container}>
      <Text>{message || "Loading..!."}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
});
/*
export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}
  */
