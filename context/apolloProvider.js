import React, { useState, useEffect } from "react";
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { View, ActivityIndicator } from 'react-native';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// This will hold our single, initialized client instance
let client;

function createApolloClient(token) {
    const httpLink = createHttpLink({
        uri: `${BACKEND_URL}/graphql`,
    });

    const authLink = setContext((_, { headers }) => {
        // NOTE: We now use the token passed directly to this function, not AsyncStorage.
        return {
            headers: {
                ...headers,
                authorization: token ? `Bearer ${token}` : "",
            },
        };
    });

    return new ApolloClient({
        link: authLink.concat(httpLink),
        cache: new InMemoryCache(),
    });
}

export function ApolloProviderWrapper({ children }) {
    const [apolloClient, setApolloClient] = useState(null);

    useEffect(() => {
        const initializeApollo = async () => {
            // CRITICAL: Load the initial token from storage
            const token = await AsyncStorage.getItem("token");
            
            // Create the client instance using the loaded token
            client = createApolloClient(token);
            
            // Set the client state, triggering a re-render and providing the Apollo context
            setApolloClient(client);
        };

        initializeApollo();
    }, []); // Only run once on mount

    if (!apolloClient) {
        // IMPORTANT: Show a loading indicator until the client is ready
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000000' }}>
                <ActivityIndicator size="large" color="#00FF00" />
                <Text style={{ color: '#00FF00', marginTop: 10 }}>Securing connection...</Text>
            </View>
        );
    }

    // Only render the app once the client is initialized with the token
    return <ApolloProvider client={apolloClient}>{children}</ApolloProvider>;
}
