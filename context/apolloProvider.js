// context/apolloProvider.js
import React, { useState, useEffect } from "react";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  createHttpLink,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import AsyncStorage from "@react-native-async-storage/async-storage";
// 💡 New Import for Persistence
import { persistCache } from 'apollo3-cache-persist'; 

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export function useApolloClient() {
  const [client, setClient] = useState(null);
  const [cacheReady, setCacheReady] = useState(false); // 💡 New State

  useEffect(() => {
    const initializeClient = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        console.log("🔄 Apollo Client: Initializing with token:", token ? "YES" : "NO");

        // 1. Define the Cache Strategy (Stable Keys)
        const cache = new InMemoryCache({
          typePolicies: {
            // ✅ CRITICAL: Use the immutable 'cid' for media types
            Video: { 
              keyFields: ["cid"], 
            },
            // Add 'Image' or other media types here if they have a CID
            // Image: {
            //   keyFields: ["cid"],
            // },
          },
        });
        
        // 2. Implement Offline Persistence
        await persistCache({
            cache,
            storage: AsyncStorage, // Use React Native's AsyncStorage
            debug: false, // Set to true for debugging persistence
        });
        setCacheReady(true); // Cache is loaded from disk (or created)

        const httpLink = createHttpLink({
          uri: `${BACKEND_URL}/graphql`,
          credentials: "include",
        });

        const authLink = setContext(async (_, { headers }) => {
          // Get fresh token on every request
          const freshToken = await AsyncStorage.getItem("token");

          // ... your token logging logic ...
          if (freshToken) {
            return {
              headers: {
                ...headers,
                authorization: `Bearer ${freshToken}`,
              },
            };
          } else {
            return { headers };
          }
        });

        const newClient = new ApolloClient({
          link: authLink.concat(httpLink),
          // Pass the configured cache instance
          cache: cache, 
        });

        setClient(newClient);
      } catch (error) {
        console.error("❌ Apollo Client: Initialization error:", error);
      }
    };

    initializeClient();
  }, []);

  // Return client only when both the client and the cache are ready
  return cacheReady ? client : null; 
}

export function ApolloProviderWrapper({ children }) {
  const client = useApolloClient();

  // 💡 Modified: Wait until the Apollo Client is fully configured AND the cache is loaded from disk
  if (!client) {
    return null; // or a loading spinner
  }

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}

