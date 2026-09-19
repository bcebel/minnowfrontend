import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";
import VerificationText from "../components/verification";

export default function Root({ children }: PropsWithChildren) {
  const title = "BubbleBased - Digital Neighborhoods, Not Just Feeds";
  const description =
    "Join bubblebased.com - a private social network where you control your privacy, earn from your content, and connect in digital neighborhoods. Bubbly & based.";
  const url = "https://bubblebased.com";
  const image = "https://bubblebased.com/bble.png";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>bubbleBASED - 🫧 Digital Neighborhoods, Not Just Feeds</title>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
      html, body, #root {
        margin: 0;
        padding: 0;
        height: 100%;
        width: 100%;
        overscroll-behavior: none;
      }
      body {
        background-color: #130720;
      }
      #root {
        display: flex;
        flex-direction: column;
      }
    `,
          }}
        />
        <meta name="description" content={description} />
        <meta
          name="keywords"
          content="social network, privacy, digital neighborhoods, affiliate marketing, community, bubblebase"
        />
        <meta name="author" content="BubbleBase" />
        <meta name="robots" content="index, follow" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta
          property="og:image:secure_url"
          content="https://bubblebased.com/bbl-og.jpg"
        />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:site_name" content="BubbleBased" />
        <meta property="og:locale" content="en_US" />
        <meta
          name="root.txt"
          content="lvnAxw0UhYgjF3kq4GKccyigEEVkHXkKTHntmIXRGvJ9aIHkiVw4Kg=="
        />

        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@bubbleBASED_" />
        <meta name="twitter:creator" content="@bubbleBASED_" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta
          name="twitter:image"
          content="https://bubblebased.com/bbl-og.jpg"
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              name: "BubbleBase",
              description: description,
              url: url,
              applicationCategory: "SocialNetworkApplication",
              operatingSystem: "Web Browser, iOS, Android",
              permissions: "browser",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
              },
              author: {
                "@type": "Organization",
                name: "BubbleBase",
                url: url,
              },
              featureList: [
                "Digital neighborhoods",
                "Privacy control",
                "Affiliate link integration",
                "Community revenue sharing",
              ],
            }),
          }}
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "BubbleBased",
              url: url,
              logo: "https://bubblebased.com/logo.png",
              description: description,
              sameAs: [
                "https://twitter.com/bubbleBASED_",
                "https://instagram.com/bubblebase",
              ],
              address: {
                "@type": "PostalAddress",
                addressLocality: "Internet",
                addressCountry: "US",
              },
            }),
          }}
        />

        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link rel="icon" href="/favicon.ico" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="/favicon-16x16.png"
        />

        {/* Unified WebTorrent Initialization */}
        <script
          type="module"
          dangerouslySetInnerHTML={{
            __html: `
      import WebTorrent from 'https://esm.sh/webtorrent/dist/webtorrent.min.js';
      window.WebTorrent = WebTorrent;

      window.enhancedTrackers = [
        "wss://tracker-0ad4cca9fd92.herokuapp.com",
        "wss://tracker.files.fm:7073/announce",
        "wss://tracker.webtorrent.dev",
        "wss://tracker.openwebtorrent.com",
        "wss://tracker.btorrent.xyz",
        "wss://tracker.files.fm:7073",
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.tracker.cl:1337/announce",
        "udp://9.rarbg.to:2710/announce",
        "udp://tracker.coppersurfer.tk:6969/announce",
        "udp://tracker.leechers-paradise.org:6969/announce",
        "udp://tracker.internetwarriors.net:1337/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.moeking.me:6969/announce",
        "udp://opentor.org:2710/announce",
        "udp://tracker.cyberia.is:6969/announce",
        "udp://tracker3.itzmx.com:6961/announce"
      ];

      try {
        if (typeof window !== "undefined" && window.WebTorrent) {
          window.globalWebTorrentClient = new window.WebTorrent({
            tracker: {
              announce: window.enhancedTrackers,
              rtcConfig: {
                iceServers: [
                  { urls: "stun:stun.relay.metered.ca:80" },
                  {
                    urls: "turn:global.relay.metered.ca:80",
                    username: "fe67734f65cabae0c1f0bf61",
                    credential: "AY3FDMwL9QjEIZ2R",
                  },
                  { urls: "stun:stun.l.google.com:19302" },
                  { urls: "stun:stun1.l.google.com:19302" },
                     { urls: "stun:global.stun.twilio.com:3478" }
                ],
              },
            },
            webSeeds: true,
          });
        }

        console.log("🌪️ CHAMP INITIALIZED WITH HEROKU TRACKER");

        if ('serviceWorker' in navigator) {
          navigator.serviceWorker
            .register("/sw.min.js", { scope: "/" })
            .then((registration) => navigator.serviceWorker.ready.then(() => registration))
            .then((registration) => {
              window.globalWebTorrentClient.createServer({
                controller: registration,
              });
              window.__canStream = true;
              console.log("🎬 Service worker registered and server created");
            })
            .catch((e) => {
              console.error("🎬 Service worker failed:", e);
              window.__canStream = false;
            });
        }
      } catch (e) {
        console.error("🌪️ CHAMP FAILED:", e);
      }
    `,
          }}
        />

        <meta name="theme-color" content="#20B2AA" />
        <meta name="msapplication-TileColor" content="#20B2AA" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="format-detection" content="telephone=no" />
        <link rel="canonical" href={url} />
        <meta
          name="impact-site-verification"
          content="6430b649-d08d-495d-8ef7-5f05702bf594"
        />
        <link rel="preload" as="image" href="/bble.png" />
      </head>

      <body>
        <div
          id="splash-screen"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#130720",
            backgroundImage: "url(/bble.png)",
            backgroundSize: "cover",
            backgroundPosition: "center",
            color: "#ffffff",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            textAlign: "center",
            padding: "20px",
            boxSizing: "border-box",
            zIndex: 99999,
          }}
        >
          <img
            src="/bble.png"
            alt="BubbleBased"
            style={{ width: "96px", height: "96px", marginBottom: "1rem" }}
          />
          <h1
            style={{
              fontSize: "2.5rem",
              marginBottom: "0.5rem",
              color: "#20B2AA",
            }}
          >
            BubbleBased
          </h1>
          <p style={{ fontSize: "1.2rem", color: "#ccc", maxWidth: "500px" }}>
            Digital Neighborhoods, Not Just Feeds.
          </p>
        </div>

        <div id="root">{children}</div>

        <script
          dangerouslySetInnerHTML={{
            __html: `
      window.addEventListener('DOMContentLoaded', () => {
        const checkReact = setInterval(() => {
          const root = document.getElementById('root');
          if (root && root.children.length > 0) {
            const splash = document.getElementById('splash-screen');
            if (splash) splash.style.display = 'none';
            clearInterval(checkReact);
          }
        }, 50);
      });
    `,
          }}
        />
      </body>
    </html>
  );
}
