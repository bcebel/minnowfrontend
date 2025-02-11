
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Linking,
  Image,
  StyleSheet,
} from "react-native";

const MyComponent = () => {
  const handlePress = () => {
    // The URL you want to link to
    const url = "https://minnowspace.daily.co/minnowspace";

    // Open the URL
    Linking.openURL(url).catch((err) =>
      console.error("An error occurred", err)
    );
  };

  
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Click the link below to join the chat:</Text>
      <TouchableOpacity onPress={handlePress}>
        <Text style={styles.link}>be antisocial</Text>
      </TouchableOpacity>
      <Image
        source={require("../../assets/images/antisocial3.jpeg")}
        style={{ width: 200, height: 200, padding: 10, margin: 10 }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  text: {
    fontSize: 16,
    marginBottom: 10,
  },
  link: {
    fontSize: 18,
    color: "blue",
    textDecorationLine: "underline",
  },
});

export default MyComponent;
