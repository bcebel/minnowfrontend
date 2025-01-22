import * as React from "react";
import { Modal, Portal, Text, Button, PaperProvider } from "react-native-paper";
import { Pressable } from "react-native";

import { Link } from "expo-router";

const MyComponent = () => {
  const [visible, setVisible] = React.useState(false);

  const showModal = () => setVisible(true);
  const hideModal = () => setVisible(false);
  const containerStyle = { backgroundColor: "white", padding: 20 };

  return (
    <PaperProvider>
      <Portal>
        <Modal
          visible={visible}
          onDismiss={hideModal}
          contentContainerStyle={containerStyle}
        >
              <Link href="https://www.tkqlhce.com/click-101317164-15077776" asChild>
                <Pressable>
                  <Text>Home</Text>
                </Pressable>
              </Link>
          <Text>Example Modal. Click outside this area to dismiss.</Text>
        </Modal>
      </Portal>
      <Button style={{ marginTop: 30 }} onPress={showModal}>
        Show
      </Button>
    </PaperProvider>
  );
};

export default MyComponent;
