// components/TabPreview.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export default function TabPreview({ icon, title, description, onSignUp }) {
  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <TouchableOpacity style={styles.button} onPress={onSignUp}>
        <Text style={styles.buttonText}>Sign Up to Start</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#130720',
    padding: 20,
  },
  icon: { fontSize: 80, marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  description: { fontSize: 16, color: '#ccc', textAlign: 'center', marginBottom: 30 },
  button: { backgroundColor: '#00FFFF', padding: 15, borderRadius: 30, width: '100%', alignItems: 'center' },
  buttonText: { color: '#130720', fontWeight: 'bold', fontSize: 18 },
});