import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { gql, useQuery } from "@apollo/client";
import NeighborhoodLiveStreamRecorder from "../../../components/NeighborhoodLiveStreamRecorder";

const GET_ME = gql`
  query GetMe {
    me {
      id
      username
    }
  }
`;

const GET_MY_NEIGHBORHOODS = gql`
  query GetMyNeighborhoods {
    myNeighborhoods {
      id
      name
    }
  }
`;

export default function SelectorScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedHood, setSelectedHood] = useState<string | null>(null);

  const { data: meData } = useQuery(GET_ME);
  const { data: hoodsData, loading: lHoods } = useQuery(GET_MY_NEIGHBORHOODS);

  if (isRecording) {
    return (
      <NeighborhoodLiveStreamRecorder
        neighborhoodId={selectedHood}
        username={meData?.me?.username}
        onStreamEnd={() => setIsRecording(false)}
      />
    );
  }

  if (lHoods) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pick a Bubble to Stream To</Text>

      <View style={styles.picker}>
        {hoodsData?.myNeighborhoods?.map((h: { id: string; name: string }) => (
          <TouchableOpacity
            key={h.id}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[styles.item, selectedHood === h.id && styles.selected]}
            onPress={() => setSelectedHood(h.id)}
            activeOpacity={0.7}
          >
            <Text style={{ color: "white", fontWeight: "600" }}>{h.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={styles.goLive}
        onPress={() =>
          selectedHood ? setIsRecording(true) : alert("Pick a bubble")
        }
      >
        <Text style={styles.btnText}>GO LIVE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  loading: {
    flex: 1,
    backgroundColor: "#130720",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    color: "white",
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },
  picker: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    marginVertical: 20,
  },
  item: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: "#333",
    margin: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: "#00FFFF",
  },
  selected: {
    backgroundColor: "#ff375f",
    borderColor: "#ffffff",
    borderWidth: 3,
  },
  goLive: {
    backgroundColor: "#ff375f",
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 15,
    marginTop: 20,
  },
  btnText: { color: "white", fontWeight: "bold", fontSize: 18 },
});
