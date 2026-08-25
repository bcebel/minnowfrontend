// RandomAd.tsx
import React from "react";
import { useQuery } from "@apollo/client";
import AdMessage from "./AdMessage";
import { GET_RANDOM_AFFILIATE_LINK } from "../app/graphql/queries"

export default function RandomAd() {
  // useQuery without caching, or with a network-only fetch policy
  const { data, loading, error } = useQuery(GET_RANDOM_AFFILIATE_LINK, {
    fetchPolicy: "network-only", // 🛑 Ensures a fresh query every time it mounts
  });

  if (loading || error || !data?.randomAffiliateLink) return null;

  return <AdMessage ad={data.randomAffiliateLink} />;
}
