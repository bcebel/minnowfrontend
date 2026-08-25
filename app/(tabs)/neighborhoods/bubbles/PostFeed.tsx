import React, { useState, useMemo } from "react";
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
import RandomAd from "../../../../components/RandomAd";

export default function PostFeed({
  neighborhoodId,
}: {
  neighborhoodId: string;
}) {
  // ✅ 1. Call ALL hooks FIRST (no if statements before these!)
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data, loading, error, refetch } = useQuery(GET_POSTS, {
    variables: { neighborhoodId },
    fetchPolicy: "cache-and-network",
  });

  // ✅ 2. Call useMemo BEFORE any return statements!
  const feedData = useMemo(() => {
    if (!data?.posts) return [];

    const result = [];
    data.posts.forEach((post) => {
      if (post.title && post.url && post.imageUrl) return;
      result.push(post);
    });
    return result;
  }, [data]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // ✅ 3. NOW it is safe to have early returns
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

  // ✅ 4. Everything else is safe to use now
  return (
    <FlatList
      data={feedData}
      keyExtractor={(item, index) => {
        if (item.type === "ad") return item.adId || `ad-${index}`;
        return item.id ? `post-${item.id}` : `item-${index}`;
      }}
      renderItem={({ item, index }) => {
        if ((index + 1) % 5 === 0) {
          return <RandomAd />;
        }
        return (
          <FeedItem
            post={item}
            onLike={() => console.log("Like:", item.id)}
            onComment={() => console.log("Comment:", item.id)}
            onDelete={() => refetch()}
          />
        );
      }}
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
