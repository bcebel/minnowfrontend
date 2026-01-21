import { ScrollViewStyleReset } from "expo-router/html";
import { type PropsWithChildren } from "react";
import VerificationText from "../components/verification";

export default function Root({ children }: PropsWithChildren) {
  const title = "BubbleBase - Digital Neighborhoods, Not Just Feeds";
  const description =
    "Join bubblebase.app - a private social network where you control your privacy, earn from your content, and connect in digital neighborhoods. Bubbly & based.";
  const url = "https://bubblebase.app";
  const image = "https://bubblebase.app/og-image.jpg";

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <ScrollViewStyleReset />
        {/* Primary Meta Tags */}
        <title>{title}</title>
        <meta name="title" content={title} />
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
        <meta property="og:site_name" content="BubbleBase" />
        <meta property="og:locale" content="en_US" />
        <meta
          name="root.txt"
          content="lvnAxw0UhYgjF3kq4GKccyigEEVkHXkKTHntmIXRGvJ9aIHkiVw4Kg=="
        />
        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content={url} />
        <meta property="twitter:title" content={title} />
        <meta property="twitter:description" content={description} />
        <meta property="twitter:image" content={image} />
        <meta property="twitter:creator" content="@bubblebase" />
        {/* Schema.org structured data */}
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
        {/* Additional Schema for Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "BubbleBase",
              url: url,
              logo: "https://bubblebase.app/logo.png",
              description: description,
              sameAs: [
                "https://twitter.com/bubblebase",
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
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Favicon */}
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

        {/* 1. Load the library first */}
        <script src="https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js"></script>

        <script
          dangerouslySetInnerHTML={{
            __html: `
      window.enhancedTrackers = [
        "wss://tracker-0ad4cca9fd92.herokuapp.com",
      ];
      try {
        window.globalWebTorrentClient = new window.WebTorrent({
          tracker: { 
            announce: window.enhancedTrackers,
            heartbeat: 10 // Keeps Heroku connection alive
          }
        });
        console.log("🌪️ CHAMP INITIALIZED WITH HEROKU TRACKER");
      } catch(e) {
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
        {/* Canonical URL */}
        <link rel="canonical" href={url} />
        <meta
          name="impact-site-verification"
          value="6430b649-d08d-495d-8ef7-5f05702bf594"
        />
      </head>

      <body>{children}</body>
    </html>
  );
}
