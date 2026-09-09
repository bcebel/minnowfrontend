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

const GET_ME = gql`
  query GetMe {
    me {
      username
    }
  }
`;

export default function InboxScreen() {
  const router = useRouter();
const { data, loading, error } = useQuery(GET_INBOX, {
  fetchPolicy: "network-only", // ✅ ALWAYS fetch fresh data!
});  const { data: meData } = useQuery(GET_ME);
  const myUsername = meData?.me?.username;

  if (loading) return <Text>Loading...</Text>;
  if (error) return <Text>Error: {error.message}</Text>;

  const inboxBubbles = data?.myDirectMessageBubbles || [];

  return (
    <View style={{ flex: 1, padding: 20 }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", color: "#00ffff" }}>
        📩 Inbox
      </Text>

      <FlatList
        data={inboxBubbles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          // ✅ Find the OTHER user's username
          const otherUser = item.members.find(
            (member) => member.user.username !== myUsername,
          );

          return (
            <View
              style={{
                padding: 15,
                backgroundColor: "#1C0A2E",
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              {/* ✅ Show the OTHER user's username */}
              <Text style={{ color: "#fff", fontWeight: "bold" }}>
                {otherUser?.user?.username || "Direct Message"}
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
          );
        }}
      />
    </View>
  );
}
