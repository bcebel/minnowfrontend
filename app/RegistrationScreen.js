// RegistrationScreen.js
import React, { useState } from "react";
import { View } from "react-native";
import { Text } from "react-native-paper";
import Background from "../components/Background";
import Logo from "../components/Logo";
import Header from "../components/Header";
import Button from "../components/Button";
import TextInput from "../components/TextInput";
import BackButton from "../components/BackButton";
import theme from "./core/theme";
const RegistrationScreen = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async () => {
    try {
      const response = await fetch(
        "https://minnowspacebackend-e6635e46c3d0.herokuapp.com/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            username,
            email,
            password,
          }),
        }
      );

      const data = await response.json();
      console.log(data);
      alert(`welcome to da club!  Now log in and get chatting and memeing!`);
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <View>
      <Text>New Account Register Here</Text>
      <TextInput
        placeholder="Username"
        placeholderTextColor="#888"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor="#888"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        onSubmitEditing={handleRegister}
      />
      <Button title="Register" mode="contained" onPress={handleRegister} />
    </View>
  );
};

export default RegistrationScreen;
