import React from "react";

import Background from "../../components/Background.js";
import Logo from "../../components/Logo.js";
import Header from "../../components/Header.js";
import Paragraph from "../../components/Paragraph.js";
import Button from "../../components/Button.js";

export default function HomeScreen({ navigation }) {
  return (
    <Background>
      <Logo />
      <Header>Welcome 💫</Header>
      <Paragraph>Congratulations you are logged in.</Paragraph>
      <Button
        mode="outlined"
        onPress={() =>
          navigation.reset({
            index: 0,
            routes: [{ name: "StartScreen" }],
          })
        }
      >
        Sign out
      </Button>
    </Background>
  );
}
