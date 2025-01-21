import React, { useState, useEffect } from "react";
import { io } from "socket.io-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
  const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

export const AuthContext = React.createContext();

const setupSocket = (token) => io(BACKEND_URL, { auth: { token } });

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem("token").then((savedToken) => {
      if (savedToken) {
        setToken(savedToken);
        setSocket(setupSocket(savedToken));
      }
    });
  }, []);

  const login = async (username, password, navigation) => {
    // (Same login logic as before)
  };

  const logout = async () => {
    await AsyncStorage.removeItem("token");
    setToken(null);
    if (socket) socket.disconnect();
    setSocket(null);
  };

  return (
    <AuthContext.Provider value={{ token, socket, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
