// context/apolloProvider.js
import React, { useState, useEffect } from "react";
import {
  ApolloClient,
  InMemoryCache,
  ApolloProvider,
  HttpLink,
  split,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistCache } from "apollo3-cache-persist";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#130720",
  },
});

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
// Remove "http://" or "https://" from the URL for the WebSocket link
const WS_URL = BACKEND_URL.replace(/^https?:\/\//, "");

export function useApolloClient() {
  const [client, setClient] = useState(null);
  const [cacheReady, setCacheReady] = useState(false);

  useEffect(() => {
    const initializeClient = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        console.log(
          "🔄 Apollo Client: Initializing with token:",
          token ? "YES" : "NO",
        );

        // apolloProvider.js
        // apolloProvider.js
        const cache = new InMemoryCache({
          typePolicies: {
            Video: { keyFields: ["cid"] },
            Image: { keyFields: ["cid"] },
            Post: { keyFields: ["id"] },
            PostMedia: { keyFields: ["cid"] }, // ✅ Add this!
            Query: {
              fields: {
                posts: {
                  // ✅ CRITICAL: Don't merge, just replace
                  merge(existing, incoming) {
                    // If there's no incoming, return existing
                    if (!incoming) return existing;
                    // Just return incoming - replace everything
                    return incoming;
                  },
                },
              },
            },
          },
        });
        await persistCache({
          cache,
          storage: AsyncStorage,
          debug: false,
        });
        setCacheReady(true);

        const httpLink = new HttpLink({
          uri: `${BACKEND_URL}/graphql`,
          credentials: "include",
        });

        // WebSocket link for subscriptions
        const wsLink = new GraphQLWsLink(
          createClient({
            url: `wss://${WS_URL}/graphql`, // Or 'ws://' if not using SSL
            connectionParams: {
              Authorization: `Bearer ${token}`,
            },
          }),
        );

        const authLink = setContext(async (_, { headers }) => {
          const freshToken = await AsyncStorage.getItem("token");
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

        // Split traffic between HTTP and WebSockets
        const splitLink = split(
          ({ query }) => {
            const definition = getMainDefinition(query);
            return (
              definition.kind === "OperationDefinition" &&
              definition.operation === "subscription"
            );
          },
          wsLink,
          authLink.concat(httpLink),
        );

        const newClient = new ApolloClient({
          link: splitLink,
          cache: cache,
        });

        setClient(newClient);
      } catch (error) {
        console.error("❌ Apollo Client: Initialization error:", error);
      }
    };

    initializeClient();
  }, []);

  return cacheReady ? client : null;
}

export function ApolloProviderWrapper({ children }) {
  const client = useApolloClient();

  if (!client) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#00ffff" />
      </View>
    );
  }

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
