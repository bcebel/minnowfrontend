// app/neighborhoods/create.js
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useMutation } from "@apollo/client";
import { gql } from "@apollo/client";
import { useRouter } from "expo-router";

const CREATE_NEIGHBORHOOD = gql`
  mutation CreateNeighborhood(
    $name: String!
    $description: String
    $type: String!
  ) {
    createNeighborhood(name: $name, description: $description, type: $type) {
      id
      name
      description
      type
    }
  }
`;

export default function CreateNeighborhoodScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("private");
  const [createNeighborhood] = useMutation(CREATE_NEIGHBORHOOD);

  const handleCreate = async () => {
    if (!name.trim()) {
      alert("Please enter a neighborhood name");
      return;
    }

    try {
      const { data } = await createNeighborhood({
        variables: {
          name: name.trim(),
          description: description.trim(),
          type,
        },
      });

      alert(`Neighborhood "${data.createNeighborhood.name}" created!`);
      router.replace(`/bubbles/${data.createNeighborhood.id}`);
    } catch (error) {
      alert("Error creating neighborhood: " + error.message);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Create a Neighborhood</Text>
      <Text style={styles.subtitle}>Start your own digital community</Text>

      <View style={styles.form}>
        <Text style={styles.label}>Neighborhood Name *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Thanksgiving 2025, Coding Crew, Book Club"
          value={name}
          onChangeText={setName}
          maxLength={50}
        />

        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="What's this neighborhood about?"
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />

        <Text style={styles.label}>Privacy Setting</Text>
        <View style={styles.typeContainer}>
          {["personal", "private", "public"].map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.typeOption,
                type === option && styles.typeOptionSelected,
              ]}
              onPress={() => setType(option)}
            >
              <Text
                style={[
                  styles.typeText,
                  type === option && styles.typeTextSelected,
                ]}
              >
                {option === "personal" && "👤 Personal - Just you"}
                {option === "private" && "🔒 Private - Invite only"}
                {option === "public" && "🌍 Public - Anyone can join"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.createButton,
            !name.trim() && styles.createButtonDisabled,
          ]}
          onPress={handleCreate}
          disabled={!name.trim()}
        >
          <Text style={styles.createButtonText}>Create Neighborhood</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => router.back()}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#130720",
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#00ffff",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#00AA00",
    textAlign: "center",
    marginBottom: 30,
  },
  form: {
    gap: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#00ffff",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 15,
    color: "#FFF",
    fontSize: 16,
  },
  textArea: {
    minHeight: 100,
  },
  typeContainer: {
    gap: 10,
  },
  typeOption: {
    backgroundColor: "#111",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 8,
    padding: 15,
  },
  typeOptionSelected: {
    borderColor: "#00ffff",
    backgroundColor: "#1a2a1a",
  },
  typeText: {
    color: "#CCC",
    fontSize: 14,
  },
  typeTextSelected: {
    color: "#00ffff",
    fontWeight: "bold",
  },
  createButton: {
    backgroundColor: "#00ffff",
    padding: 18,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 10,
  },
  createButtonDisabled: {
    backgroundColor: "#333",
  },
  createButtonText: {
    color: "#130720",
    fontWeight: "bold",
    fontSize: 16,
  },
  cancelButton: {
    padding: 15,
    alignItems: "center",
  },
  cancelButtonText: {
    color: "#00AA00",
    fontSize: 16,
  },
});
