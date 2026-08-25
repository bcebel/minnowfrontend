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
import { GET_POSTS } from "../../../graphql/queries"; // ✅ Only import GET_POSTS
import FeedItem from "../../../../components/FeedItem";
import PostComposer from "../../PostComposer";
import RandomAd from "../../../../components/RandomAd"; // ✅ Import RandomAd

export default function PostFeed({
  neighborhoodId,
}: {
  neighborhoodId: string;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ✅ REMOVED the GET_RANDOM_AFFILIATE_LINK query. RandomAd handles that now.
  const { data, loading, error, refetch } = useQuery(GET_POSTS, {
    variables: { neighborhoodId },
    fetchPolicy: "cache-and-network",
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

  // ✅ We only push posts now. The RandomAd component will handle finding its own place.
  // Since we are using RandomAd, we don't need to inject the ad data here.
  const feedData = useMemo(() => {
    const result = [];

    posts.forEach((post) => {
      // 🛑 Skip raw backend ads (still keep this filter to prevent weird stuff)
      if (post.title && post.url && post.imageUrl) {
        return;
      }

      result.push(post);
    });

    return result;
  }, [posts]);

  return (
    <FlatList
      data={feedData}
      keyExtractor={(item, index) =>
        item.id ? `post-${item.id}` : `item-${index}`
      }
      renderItem={({ item, index }) => {
        // ✅ Render a RandomAd every 5 posts (because we are no longer injecting it into feedData)
        if ((index + 1) % 10 === 0) {
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
