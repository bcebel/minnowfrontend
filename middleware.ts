import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Social media crawlers that need OG tags
const BOT_UA =
  /(Twitterbot|facebookexternalhit|Discordbot|Slackbot|TelegramBot|WhatsApp|LinkedInBot|Pinterestbot|Embedly|VKShare|Tumblr)/i;

// Your Heroku backend URL
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;


export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Match invite links: /join/abc123
  const joinMatch = pathname.match(/^\/join\/([a-zA-Z0-9]+)$/);

  if (!joinMatch) {
    return NextResponse.next();
  }

  const userAgent = request.headers.get("user-agent") || "";

  if (BOT_UA.test(userAgent)) {
    // It's a bot — fetch the dynamic OG HTML from Heroku
    return fetch(`${BACKEND_URL}/api/og/join/${joinMatch[1]}`)
      .then((res) => {
        if (!res.ok) {
          return NextResponse.next();
        }
        return res.text();
      })
      .then((html) => {
        return new NextResponse(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      })
      .catch(() => {
        // If Heroku is down, fall through to the SPA
        return NextResponse.next();
      });
  }

  // Not a bot — serve the SPA
  return NextResponse.next();
}

export const config = {
  matcher: "/join/:path*",
};
