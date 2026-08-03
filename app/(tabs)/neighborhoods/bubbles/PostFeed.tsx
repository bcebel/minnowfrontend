import React, { useState } from "react";
import {
  View,
  FlatList,
  ActivityIndicator,
  Text,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from "@apollo/client";
import { GET_POSTS } from "../../../graphql/queries";
import FeedItem from "../../../../components/FeedItem";
import PostComposer from "../../PostComposer";

export default function PostFeed({
  feedType = "universal",
  neighborhoodId = null,
  groupId = null,
}) {
  interface NeighborhoodGalleryProps {
    neighborhoodId: string;
    neighborhoodName?: string;
  }
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, loading, error, refetch, fetchMore } = useQuery(GET_POSTS, {
    variables: {
      feedType,
      neighborhoodId,
      groupId,
      limit: 10,
      offset: 0,
    },
    fetchPolicy: "cache-and-network",
  });

  const posts = data?.posts || [];

  // Pull-to-refresh handler
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } catch (err) {
      console.error("Error refreshing feed:", err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Infinite scroll load more handler
  const handleLoadMore = () => {
    if (!posts.length || loading) return;

    fetchMore({
      variables: {
        offset: posts.length,
      },
      updateQuery: (prev, { fetchMoreResult }) => {
        if (!fetchMoreResult || !fetchMoreResult.posts.length) return prev;
        return {
          ...prev,
          posts: [...prev.posts, ...fetchMoreResult.posts],
        };
      },
    });
  };

  if (loading && !data) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#00FFFF" />
        <Text style={styles.loadingText}>Loading feed stream...</Text>
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Failed to load feed</Text>
        <Text style={styles.errorSubText}>{error.message}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <FeedItem
          post={item}
          onLike={() => console.log("Boosted post:", item.id)}
          onComment={() => console.log("Replying to post:", item.id)}
        />
      )}
      ListHeaderComponent={
        <PostComposer
          currentNeighborhoodId={neighborhoodId}
          currentGroupId={groupId}
        />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No posts yet on this stream.</Text>
          <Text style={styles.emptySubText}>
            Be the first to post something above!
          </Text>
        </View>
      }
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={handleRefresh}
          tintColor="#00FFFF"
          colors={["#00FFFF"]}
        />
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.5}
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
