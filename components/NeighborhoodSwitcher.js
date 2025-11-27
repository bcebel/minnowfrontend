// components/NeighborhoodSwitcher.js
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { gql, useQuery } from "@apollo/client";

const GET_MY_NEIGHBORHOODS = gql`
  query GetMyNeighborhoods {
    myNeighborhoods {
      id
      name
      type
      members {
        user {
          id
          username
        }
        role
      }
    }
  }
`;

export default function NeighborhoodSwitcher({ currentNeighborhoodId }) {
  const router = useRouter();
  const { data, loading, error } = useQuery(GET_MY_NEIGHBORHOODS);

  const neighborhoods = data?.myNeighborhoods || [];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Neighborhoods</Text>

      {/* Global/Universal Feed */}
      <TouchableOpacity
        style={[
          styles.neighborhoodItem,
          !currentNeighborhoodId && styles.active,
        ]}
        onPress={() => router.push("/chat")}
      >
        <Text style={styles.neighborhoodName}>🌍 Global Feed</Text>
        <Text style={styles.neighborhoodType}>Everyone</Text>
      </TouchableOpacity>

      {/* User's Neighborhoods */}
      {neighborhoods.map((neighborhood) => (
        <TouchableOpacity
          key={neighborhood.id}
          style={[
            styles.neighborhoodItem,
            currentNeighborhoodId === neighborhood.id && styles.active,
          ]}
          onPress={() =>
            router.push(`/neighborhood-chat?neighborhoodId=${neighborhood.id}`)
          }
        >
          <Text style={styles.neighborhoodName}>
            {neighborhood.type === "personal" ? "🏠" : "🏘️"} {neighborhood.name}
          </Text>
          <Text style={styles.neighborhoodType}>
            {neighborhood.type} • {neighborhood.members.length} members
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 10,
    backgroundColor: "#111111",
  },
  title: {
    color: "#00ffff",
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 10,
  },
  neighborhoodItem: {
    padding: 12,
    backgroundColor: "#222222",
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#333333",
  },
  active: {
    borderColor: "#00ffff",
    backgroundColor: "#1a331a",
  },
  neighborhoodName: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  neighborhoodType: {
    color: "#888888",
    fontSize: 12,
    marginTop: 4,
  },
});
