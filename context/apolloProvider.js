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

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export function useApolloClient() {
  const [client, setClient] = useState(null);

  useEffect(() => {
    const initializeClient = async () => {
      try {
        const token = await AsyncStorage.getItem("token");
        console.log(
          "🔄 Apollo Client: Initializing with token:",
          token ? "YES" : "NO"
        );

        const httpLink = createHttpLink({
          uri: `${BACKEND_URL}/graphql`,
        });

    const authLink = setContext(async (_, { headers }) => {
      // Get fresh token on every request
      const freshToken = await AsyncStorage.getItem("token");

      console.log(
        "🔑 Apollo Auth Link - Fresh Token:",
        freshToken ? "YES" : "NO"
      );
      console.log("🔑 Apollo Auth Link - Token length:", freshToken?.length);
      console.log("🔑 Apollo Auth Link - Full token:", freshToken);

      if (freshToken) {
        console.log("✅ Apollo Auth Link - Adding Bearer token to request");
        return {
          headers: {
            ...headers,
            authorization: `Bearer ${freshToken}`,
          },
        };
      } else {
        console.log("❌ Apollo Auth Link - No token available");
        return { headers };
      }
    });

        const newClient = new ApolloClient({
          link: authLink.concat(httpLink),
          cache: new InMemoryCache(),
        });

        setClient(newClient);
      } catch (error) {
        console.error("❌ Apollo Client: Initialization error:", error);
      }
    };

    initializeClient();
  }, []);

  return client;
}

export function ApolloProviderWrapper({ children }) {
  const client = useApolloClient();

  if (!client) {
    return null; // or a loading spinner
  }

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
