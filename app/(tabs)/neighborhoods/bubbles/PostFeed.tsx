import React, { useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useQuery } from "@apollo/client";
import { GET_POSTS } from "../../../graphql/queries";
import FeedItem from "../../../../components/FeedItem";
import PostComposer from "../../PostComposer";

export default function NeighborhoodGallery({
  neighborhoodId,
}: {
  neighborhoodId: string;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ✅ SIMPLE QUERY - NO PAGINATION
  const { data, loading, error, refetch } = useQuery(GET_POSTS, {
    variables: {
      neighborhoodId,
    },
    fetchPolicy: "cache-and-network", // ← No cache issues
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  if (loading && !data) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00FFFF" />
        <Text style={styles.loadingText}>Loading feed...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load feed</Text>
        <Text style={styles.errorSubText}>{error.message}</Text>
      </View>
    );
  }

  const posts = data?.posts || [];

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => `post-${item.id}`} // ← UNIQUE KEY
      renderItem={({ item }) => (
        <FeedItem
          post={item}
          onLike={() => console.log("Like:", item.id)}
          onComment={() => console.log("Comment:", item.id)}
        />
      )}
      ListHeaderComponent={
        <PostComposer
          currentNeighborhoodId={neighborhoodId}
          onPostCreated={refetch}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No posts yet.</Text>
          <Text style={styles.emptySubText}>Be the first to post!</Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor="#00FFFF"
        />
      }
      contentContainerStyle={styles.listContent}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 12,
    backgroundColor: "#130720",
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#130720",
    padding: 20,
  },
  loadingText: {
    color: "#8A829E",
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: "#FF4D4D",
    fontSize: 16,
    fontWeight: "bold",
  },
  errorSubText: {
    color: "#8A829E",
    fontSize: 12,
    marginTop: 6,
    textAlign: "center",
  },
  emptyContainer: {
    padding: 30,
    alignItems: "center",
  },
  emptyText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubText: {
    color: "#8A829E",
    fontSize: 13,
    marginTop: 4,
  },
});
