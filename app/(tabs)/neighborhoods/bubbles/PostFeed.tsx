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
import PostComposer from "../../PostComposer";
import AdMessage from "../../../../components/AdMessage";
import RandomAd from "../../../../components/RandomAd"


export default function PostFeed({
  neighborhoodId,
}: {
  neighborhoodId: string;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { data: adData } = useQuery(GET_RANDOM_AFFILIATE_LINK);

  const { data, loading, error, refetch } = useQuery(GET_POSTS, {
    variables: { neighborhoodId },
    fetchPolicy: "cache-and-network",
    // ✅ NO pollInterval! (Just like the gallery)
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
  const ad = adData?.randomAffiliateLink;

  // ✅ Use useMemo + unique adId, exactly like the Gallery
  const feedData = useMemo(() => {
    const result = [];

    posts.forEach((post, index) => {
      // 🛑 Skip raw backend ads
      if (post.title && post.url && post.imageUrl) {
        return;
      }

      result.push(post);

      // ✅ Inject ad every 5 posts
      if ((index + 1) % 5 === 0 && ad) {
        // ✅ Unique adId prevents jumbling
        result.push({ ...ad, adId: `ad-${index}`, type: "ad" });
      }
    });

    return result;
  }, [posts, ad]); // ✅ Dependencies are critical

  return (
    <FlatList
      data={feedData}
      // ✅ Stable keys: posts use their ID, ads use adId
      keyExtractor={(item, index) => {
        if (item.type === "ad") return item.adId || `ad-${index}`;
        return item.id ? `post-${item.id}` : `item-${index}`;
      }}
      renderItem={({ item }) => {
        if (item.type === "ad") {
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
