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
  });
  const { data: meData } = useQuery(GET_ME);
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
          console.log("myUsername:", myUsername);
          console.log(
            "members:",
            item.members.map((m) => m.user.username),
          );
          // ✅ Find the OTHER person (everyone who isn't me)
          const otherUsers = item.members.filter(
            (member) => member.user.username !== myUsername,
          );

          // ✅ Build a display name: if 1 other person, show them. If more, join with commas.
          const displayName = otherUsers
            .map((m) => m.user.username)
            .join(" ↔ ");
          return (
            <View
              style={{
                padding: 15,
                backgroundColor: "#1C0A2E",
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>
                {displayName}
              </Text>

              <TouchableOpacity
                onPress={() =>
                  router.push(
                    `/neighborhoods/bubbles/neighborhood-chat?neighborhoodId=${item.id}`,
                  )
                }
              >
                <Text style={{ color: "#00ffff", marginTop: 5 }}>
                  Open Chat
                </Text>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}
