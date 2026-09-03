// components/LandingPreview.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';

const TAB_INFO = [
  {
    key: 'Home',
    icon: '🏠',
    title: 'Your Private Feed',
    description:
      'Join "bubbles" (neighborhoods) based on your interests. You only see content shared within those specific groups, not everything from everyone you know.',
  },
  {
    key: 'Gallery',
    icon: '🖼️',
    title: 'Decentralized Media',
    description:
      'A lightning-fast media wall powered by P2P (WebTorrent). Your community serves the photos and videos, saving bandwidth and keeping things snappy.',
  },
  {
    key: 'Livestream',
    icon: '📡',
    title: 'Go Live with P2P',
    description:
      'Stream to your bubbles using our decentralized engine. No central server bottlenecks – just real-time video shared peer-to-peer.',
  },
  {
    key: 'Profile',
    icon: '👤',
    title: 'Earn from Your Content',
    description:
      'Set up your affiliate links. The more you engage and the better your content, the more your ads get shown to the community.',
  },
];

export default function LandingPreview({ onSignUp }) {
  const [activeTab, setActiveTab] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const openTab = (tab) => {
    setActiveTab(tab);
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* Tab Bar (same as in your app, but just for demonstration) */}
      <View style={styles.tabBar}>
        {TAB_INFO.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={styles.tabItem}
            onPress={() => openTab(tab)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text style={styles.tabLabel}>{tab.key}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Modal for description */}
      <Modal
        visible={modalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{activeTab?.title}</Text>
            <Text style={styles.modalDescription}>{activeTab?.description}</Text>

            <TouchableOpacity
              style={styles.ctaButton}
              onPress={onSignUp}
            >
              <Text style={styles.ctaText}>Sign Up to Start</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#130720',
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    backgroundColor: '#1A0B2E',
  },
  tabItem: {
    alignItems: 'center',
  },
  tabIcon: {
    fontSize: 24,
    color: '#00FFFF',
  },
  tabLabel: {
    color: '#8A829E',
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1C0A2E',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#00FFFF',
  },
  modalTitle: {
    color: '#F5F2FA',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalDescription: {
    color: '#8A829E',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    marginBottom: 20,
  },
  ctaButton: {
    backgroundColor: '#00FFFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 30,
    marginBottom: 10,
  },
  ctaText: {
    color: '#130720',
    fontWeight: 'bold',
    fontSize: 16,
  },
  closeButton: {
    paddingVertical: 8,
  },
  closeText: {
    color: '#8A829E',
    fontSize: 14,
  },
});