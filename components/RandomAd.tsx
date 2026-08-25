// RandomAd.tsx
import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useQuery } from "@apollo/client";
import AdMessage from "./AdMessage";
import { GET_RANDOM_AFFILIATE_LINK } from "../app/graphql/queries";

export default function RandomAd() {
  // ✅ Always call the hook FIRST, no matter what
  const { data, loading } = useQuery(GET_RANDOM_AFFILIATE_LINK, {
    fetchPolicy: "cache-and-network",
  });

  // ✅ Now it's safe to check loading AFTER the hook is called
  if (loading || !data?.randomAffiliateLink) {
    return (
      <View style={styles.placeholder}>
        <ActivityIndicator color="#00FFFF" />
      </View>
    );
  }

  return <AdMessage ad={data.randomAffiliateLink} />;
}

const styles = StyleSheet.create({
  placeholder: {
    height: 200,
    marginVertical: 4,
    backgroundColor: "#1C0A2E",
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
});
