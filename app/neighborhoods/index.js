// app/neighborhoods/index.js
import React from "react";
import {
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  View,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation } from "@apollo/client";
import { Link } from "expo-router";
import { GET_NEIGHBORHOODS, JOIN_NEIGHBORHOOD } from "../graphql/queries";

export default function NeighborhoodsScreen() {
  const { loading, error, data, refetch } = useQuery(GET_NEIGHBORHOODS);
  const [joinNeighborhood] = useMutation(JOIN_NEIGHBORHOOD);

  const handleJoinNeighborhood = async (neighborhoodId) => {
    try {
      await joinNeighborhood({
        variables: { neighborhoodId },
        refetchQueries: [{ query: GET_NEIGHBORHOODS }],
      });
      alert("Joined neighborhood!");
    } catch (err) {
      alert(`Join failed: ${err.message}`);
    }
  };

  if (loading) return <ActivityIndicator size="large" style={styles.loading} />;
  if (error) return <Text style={styles.error}>Error: {error.message}</Text>;

  const renderItem = ({ item }) => (
    <View style={styles.neighborhoodItem}>
      <Text style={styles.neighborhoodName}>{item.name}</Text>
      <Text style={styles.neighborhoodType}>
        {item.type} • {item.members?.length || 0} members
      </Text>
      <Text style={styles.neighborhoodDescription}>{item.description}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.joinButton}
          onPress={() => handleJoinNeighborhood(item.id)}
        >
          <Text style={styles.joinButtonText}>Join</Text>
        </TouchableOpacity>

        <Link href={`/neighborhoods/${item.id}`} asChild>
          <TouchableOpacity style={styles.viewButton}>
            <Text style={styles.viewButtonText}>View</Text>
          </TouchableOpacity>
        </Link>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>🏘️ Neighborhoods</Text>
      <Text style={styles.subtitle}>
        {data?.neighborhoods?.length || 0} communities to explore
      </Text>

      <FlatList
        data={data?.neighborhoods || []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshing={loading}
        onRefresh={refetch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#000",
  },
  header: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#00AA00",
    marginBottom: 20,
  },
  neighborhoodItem: {
    backgroundColor: "#111",
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#333",
  },
  neighborhoodName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#00FF00",
    marginBottom: 4,
  },
  neighborhoodType: {
    fontSize: 12,
    color: "#00AA00",
    marginBottom: 8,
  },
  neighborhoodDescription: {
    fontSize: 14,
    color: "#CCC",
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 10,
  },
  joinButton: {
    backgroundColor: "#00FF00",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  joinButtonText: {
    color: "#000",
    fontWeight: "bold",
  },
  viewButton: {
    backgroundColor: "#333",
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 6,
  },
  viewButtonText: {
    color: "#00FF00",
    fontWeight: "bold",
  },
  loading: {
    marginTop: 50,
  },
  error: {
    color: "#FF4444",
    textAlign: "center",
    marginTop: 20,
  },
});
