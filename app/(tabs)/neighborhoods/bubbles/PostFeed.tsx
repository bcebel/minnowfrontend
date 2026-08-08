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
import { GET_POSTS, GET_RANDOM_AFFILIATE_LINK } from "../../../graphql/queries";
import FeedItem from "../../../../components/FeedItem";
import AdMessage from "../../../../components/AdMessage";
import PostComposer from "../../PostComposer";

interface NeighborhoodGalleryProps {
  neighborhoodId?: string;
  neighborhoodName?: string;
  groupId?: string | null;
}

export default function NeighborhoodGallery({
  neighborhoodId,
  neighborhoodName,
  groupId = null,
}: NeighborhoodGalleryProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 1. Fetch posts
  const { data, loading, error, refetch, fetchMore } = useQuery(GET_POSTS, {
    variables: {
      neighborhoodId,
      groupId,
      limit: 10,
      offset: 0,
    },
    fetchPolicy: "cache-and-network",
  });

  // 2. Fetch ad data
  const { data: adData } = useQuery(GET_RANDOM_AFFILIATE_LINK);

  const posts = data?.posts || [];

  // 3. Interleave posts and ads
  const feedWithAds = useMemo(() => {
    if (!posts.length) return [];

    const result = [];
    posts.forEach((post, index) => {
      // Add the regular post
      result.push({
        type: "post",
        data: post,
        id: post.id || post._id || `post-${index}`,
      });

      // Insert an ad every 10 posts (skip index 0)
      if (index > 0 && index % 10 === 0 && adData?.randomAffiliateLink) {
        result.push({
          type: "ad",
          data: adData.randomAffiliateLink,
          id: `ad-${index}-${adData.randomAffiliateLink.id || index}`,
        });
      }
    });

    return result;
  }, [posts, adData]);

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
        offset: posts.length, // Uses actual posts length to keep GraphQL pagination accurate
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
      data={feedWithAds}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        // Render Ad Banner
        if (item.type === "ad") {
          return <AdMessage ad={item.data} />;
        }

        // Render Normal Feed Item
        return (
          <FeedItem
            post={item.data}
            onLike={() =>
              console.log("Boosted post:", item.data.id || item.data._id)
            }
            onComment={() =>
              console.log("Replying to post:", item.data.id || item.data._id)
            }
          />
        );
      }}
      ListHeaderComponent={
        <PostComposer
          currentNeighborhoodId={neighborhoodId}
          currentGroupId={groupId}
          onPostCreated={refetch}
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
