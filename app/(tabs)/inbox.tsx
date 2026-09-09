import { useQuery, gql } from "@apollo/client";
import { FlatList, View, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";

const GET_INBOX = gql`
  query GetInbox {
    myDirectMessageBubbles {
      id
      name
      members {
        user {
          username
        }
      }
    }
  }
`;

export default function InboxScreen() {
  const router = useRouter();
  const { data, loading, error } = useQuery(GET_INBOX);

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  const inboxBubbles = data?.myDirectMessageBubbles || [];

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#00ffff" }}>
        📩 Inbox
      </Text>

      {/* ✅ Add a "New Message" button */}
      <TouchableOpacity
        style={{
          backgroundColor: "#00ffff",
          padding: 15,
          borderRadius: 20,
          marginBottom: 20,
        }}
        onPress={() => router.push("/friends")}
      >
        <Text
          style={{ color: "#130720", fontWeight: "bold", textAlign: "center" }}
        >
          New Message
        </Text>
      </TouchableOpacity>

      <FlatList
        data={inboxBubbles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={{
              padding: 15,
              backgroundColor: "#1C0A2E",
              borderRadius: 8,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "bold" }}>
              {item.name}
            </Text>
            <TouchableOpacity
              onPress={() =>
                router.push(
                  `/neighborhoods/bubbles/neighborhood-chat?neighborhoodId=${item.id}`,
                )
              }
            >
              <Text style={{ color: "#00ffff" }}>Open Chat</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}
