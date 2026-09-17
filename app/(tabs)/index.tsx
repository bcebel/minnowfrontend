import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ImageBackground,
  useWindowDimensions,
  Platform,
} from "react-native";
import { BlurView } from "expo-blur";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import WebTorrentMedia from "@/components/WebTorrentMedia";
import { themes } from "../theme";
import { warehouse } from "../../components/StreamWearhouse";
import { mediaCache } from "../../components/mediaCache";
import { clearApolloStore } from "@/context/apolloProvider";

export default function HomeScreen() {
    const [peerCount, setPeerCount] = useState(null);
    const [source, setSource] = useState(null);
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;

  const theme = themes.bubblefusion.dark;

  const handleLogout = async () => {
    try {
      // 1. Purge Apollo client memory cache
      await clearApolloStore();

      // 2. Wipe ALL auth keys & persisted disk cache
      await AsyncStorage.multiRemove([
        "token",
        "username",
        "userId",
        "apollo-cache-persist",
      ]);

      // 3. Wipe custom caches
      await warehouse.clearAllExcept("");
      await mediaCache.clearCache();

      // 4. Redirect to login
      router.replace("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require("@/assets/images/bbl.jpg")}
        style={styles.heroBubble}
        resizeMode="cover"
      />

      {/* NAV HEADER */}
      <View
        style={[
          styles.navContainer,
          isDesktop ? styles.navDesktop : styles.navMobile,
        ]}
      >
        <View style={styles.brandContainer}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoBadgeText}>bB</Text>
          </View>
          <Text style={styles.brandTitle}>bubbleBASED</Text>
        </View>

        <View style={styles.navLinks}>
          <NavButton title="" />
          <NavButton title="" />
          <NavButton title="" />

          <BlurView
            intensity={50}
            tint="dark"
            style={styles.bubbleGlassCompact}
          >
            <TouchableOpacity
              style={styles.navActionButton}
              onPress={() => router.push("/login")}
            >
              <Text style={styles.navActionButtonText}>Sign In</Text>
            </TouchableOpacity>
          </BlurView>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* HERO SECTION */}
        <View
          style={[styles.heroSection, isDesktop && styles.heroSectionDesktop]}
        >
          <View
            style={[
              styles.heroTextContainer,
              isDesktop && styles.heroTextDesktop,
            ]}
          >
            <View style={styles.tagBadge}>
              <Text style={styles.tagBadgeText}>
                Peer-to-Peer Media Network
              </Text>
            </View>

            <Text style={styles.heroTitle} role="heading" aria-level={1}>
              Stream & Share Without Middlemen.
            </Text>

            <Text style={styles.heroSub}>
              Direct peer connections, WebTorrent video streaming, and Apollo
              GraphQL synchronization built for modern web and mobile.
            </Text>

            {/* ACTION BUTTONS (Login / Logout / Join) */}
            <View style={styles.actionsRow}>
              <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => router.push("/register")}
                >
                  <Text style={styles.actionButtonText}>Join bubbleBASED</Text>
                </TouchableOpacity>
              </BlurView>

              <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => router.push("/login")}
                >
                  <Text style={styles.actionButtonText}>Sign In</Text>
                </TouchableOpacity>
              </BlurView>

              <BlurView intensity={50} tint="dark" style={styles.bubbleGlass}>
                <TouchableOpacity
                  onPress={handleLogout}
                  style={styles.logoutButton}
                >
                  <Text style={styles.actionButtonText}>Logout</Text>
                </TouchableOpacity>
              </BlurView>
            </View>
          </View>

          {/* CODE / PEER STATUS CARD */}
          <View
            style={[
              styles.heroVisualCard,
              isDesktop && styles.heroVisualDesktop,
            ]}
          >
            <BlurView intensity={30} tint="dark" style={styles.demoGlassCard}>
              {/* 1. WebTorrent Live Media Player */}
              <View style={styles.mediaFrame}>
                <WebTorrentMedia
                  media={{
                    cid: "QmWYyMqc9C3YCnszNsArdTU43KEeXqGKrw1AVrY28wxDZf",
                    magnetLink:
                      "magnet:?xt=urn:btih:b77acfd4f16c11daf18126b20164666c04829f90&dn=IMG_3517.mov&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Fexplodie.org%3A6969&tr=udp%3A%2F%2Ftracker.empire-js.us%3A1337&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.webtorrent.dev",
                    fileName: "IMG_3517.mov",
                    fileType: "video",
                  }}
                  isFocused={true}
                />
                <View style={styles.peerBadge}>
                  <View style={styles.liveDot} />
                  <Text style={styles.peerBadgeText}>
             
                  </Text>
                </View>
              </View>

              {/* 2. Mock Terminal Status Box */}
              <View style={styles.mockTerminalBox}>
                <View style={styles.terminalHeader}>
                  <View style={[styles.dot, { backgroundColor: "#FF5F56" }]} />
                  <View style={[styles.dot, { backgroundColor: "#FFBD2E" }]} />
                  <View style={[styles.dot, { backgroundColor: "#27C93F" }]} />
                  <Text style={styles.terminalTitle}></Text>
                </View>
                <View style={styles.mockContentBox}>
                  <Text style={styles.mockCodeText}>// bubbleBASED</Text>
                  <Text style={styles.mockCodeTextAccent}>feel: "small" </Text>
                  <Text style={styles.mockCodeText}>people: "you know" </Text>
                  <Text style={styles.mockCodeText}>algorithm: "none" </Text>
                  <Text style={styles.mockCodeText}>bubble: "based" </Text>
                </View>
              </View>
            </BlurView>
          </View>
        </View>

        {/* MARGARET MEAD QUOTE */}
        <View style={styles.quoteSection}>
          <BlurView intensity={40} tint="dark" style={styles.quoteGlassCard}>
            <Text style={styles.quoteText}>
              "Never doubt that a small group of thoughtful, committed citizens
              can change the world; indeed, it's the only thing that ever has."
            </Text>
            <Text style={styles.quoteAuthor}>— Margaret Mead</Text>
          </BlurView>
        </View>

        {/* FOOTER */}
        <View style={styles.footerContainer}>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} bubbleBASED. Built with React Native &
            Expo Router.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function NavButton({ title }: { title: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={styles.navLinkPressable}
    >
      <Text style={[styles.navLinkText, hovered && styles.navLinkTextHover]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0C10",
  },
  heroBubble: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.35,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Nav Header
  navContainer: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(10, 12, 16, 0.75)",
    zIndex: 10,
  },
  navDesktop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 48,
  },
  navMobile: {
    flexDirection: "column",
    gap: 16,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logoBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FF0081",
    alignItems: "center",
    justifyContent: "center",
  },
  logoBadgeText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 18,
  },
  brandTitle: {
    color: "#F5F2FA",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  navLinks: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  navLinkPressable: {
    paddingVertical: 4,
  },
  navLinkText: {
    color: "#9CA3AF",
    fontSize: 15,
    fontWeight: "500",
  },
  navLinkTextHover: {
    color: "#FFFFFF",
  },
  navActionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  navActionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },

  // Hero Section
  heroSection: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    flexDirection: "column",
    gap: 32, // Guarantees space between text/buttons and the visual card
  },
  heroSectionDesktop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 48,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroTextDesktop: {
    paddingRight: 40,
  },
  tagBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 0, 129, 0.2)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 0, 129, 0.4)",
  },
  tagBadgeText: {
    color: "#FF5CB0",
    fontSize: 13,
    fontWeight: "600",
  },
  heroTitle: {
    color: "#F5F2FA",
    fontSize: Platform.OS === "web" ? 44 : 34,
    fontWeight: "800",
    lineHeight: Platform.OS === "web" ? 52 : 42,
    letterSpacing: -1,
    marginBottom: 16,
  },
  heroSub: {
    color: "#9CA3AF",
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 32,
  },

  // Actions Container (Buttons)
  actionsRow: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap", // Prevents buttons from spilling into the card below
    marginBottom: 24, // Adds explicit margin beneath the buttons
  },
  bubbleGlass: {
    borderRadius: 48,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 0, 129, 0.3)",
    backgroundColor: "rgba(255, 0, 129, 0.2)",
  },
  bubbleGlassCompact: {
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255, 0, 129, 0.3)",
    backgroundColor: "rgba(255, 0, 129, 0.2)",
  },
  primaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 48,
    alignItems: "center",
    backgroundColor: "rgba(21, 17, 89, 0.6)",
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 48,
    alignItems: "center",
    backgroundColor: "rgba(57, 17, 89, 0.6)",
  },
  logoutButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 48,
    alignItems: "center",
    backgroundColor: "rgba(89, 17, 85, 0.6)",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "bold",
  },

  // Visual Card
  heroVisualCard: {
    width: "100%",
    backgroundColor: "rgba(19, 23, 31, 0.8)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    padding: 16,
    minHeight: 200, // Reduced from 280 for mobile screens
  },
  heroVisualDesktop: {
    flex: 1, // Only flex on desktop layout
    maxWidth: 480,
  },
  visualCardInner: {
    flex: 1,
    backgroundColor: "#0D1017",
    borderRadius: 10,
    padding: 16,
  },
  visualCardHeader: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  mockContentBox: {
    gap: 12,
  },
  mockCodeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#6B7280",
    fontSize: 14,
  },
  mockCodeTextAccent: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: "#10B981",
    fontSize: 14,
    fontWeight: "600",
  },

  // Quote Section
  quoteSection: {
    paddingHorizontal: 24,
    paddingVertical: 40,
    alignItems: "center",
  },
  quoteGlassCard: {
    maxWidth: 700,
    width: "100%",
    padding: 32,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    backgroundColor: "rgba(255, 0, 129, 0.1)",
  },
  quoteText: {
    color: "#F5F2FA",
    fontSize: 20,
    lineHeight: 30,
    textAlign: "center",
    fontStyle: "italic",
    marginBottom: 16,
  },
  quoteAuthor: {
    color: "#FF5CB0",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "right",
  },

  // Footer
  footerContainer: {
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: "center",
  },
  footerText: {
    color: "#6B7280",
    fontSize: 14,
  },
});
