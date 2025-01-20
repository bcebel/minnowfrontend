import React from "react";

import Background from "../../components/Background.js";
import Logo from "../../components/BackButton.js";
import Header from "../../components/Header";
import Button from "../../components/Button";
import Paragraph from "../../components/Paragraph";

export default function StartScreen({ navigation }) {
  return (
    <Background>
      <Logo />
      <Header>Welcome to Minnowspace! This Login Page is under construction, go to the chat tab and log in there for now</Header>
      <Paragraph>
        Minnowspace is a place where we can all come together to share our
        stories, experiences, and ideas.
      </Paragraph>
      <Button
        mode="contained"
        onPress={() => navigation.navigate("LoginScreen")}
      >
        Log in
      </Button>
      <Button
        mode="outlined"
        onPress={() => navigation.navigate("RegisterScreen")}
      >
        Create an account
      </Button>
    </Background>
  );
}
