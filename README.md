# Bubblebase

Bubblebase is a decentralized social media platform that prioritizes user privacy and peer-to-peer (P2P) content delivery. It's built on the concept of "Bubbles" (formerly known as Neighborhoods), which are private, invite-only spaces for sharing content and communicating with a trusted group of people.

## Core Concepts

*   **Bubbles:** Bubbles are the core of the Bubblebase experience. They are private spaces where users can share messages, images, and videos with other members of the Bubble. Security is enforced at the Bubble layer, ensuring that content is only shared with those you trust.
*   **P2P-First Media:** All media on Bubblebase is delivered using a P2P-first approach, powered by WebTorrent. This means that when you view an image or video, you're downloading it directly from other users who are also viewing it. This reduces reliance on centralized servers and improves performance. When P2P delivery is not possible, the platform falls back to a traditional CDN using Pinata.
*   **CID-Based Caching:** All content on Bubblebase is identified by a Content Identifier (CID). This makes the content immutable and allows for efficient caching. The platform uses both public and private cache APIs, all based on CIDs.

## Application Structure

The Bubblebase application is built with React Native and Expo. The main screens of the application are organized in the `app/(tabs)` directory:

*   **`login.tsx`:** The login screen, where users can authenticate with the platform.
*   **`index.tsx` ("Bubbles"):** This is the main screen of the application, where users can see a list of their Bubbles and access the chat for each one.
*   **`gallery.tsx` ("Bubble Gallery"):** This screen displays a gallery of all the media that has been shared in a specific Bubble.
*   **`profile/[username].js` ("Homebase"):** This is the user's profile screen, where they can see their own information and a feed of their own content.
*   **`livestream.tsx`:** This screen is used for livestreaming video to a Bubble.

## Key Technologies

Bubblebase is built with a variety of technologies, including:

*   **React Native & Expo:** The core framework for building the application.
*   **Expo Router:** Used for navigation within the application.
*   **Apollo Client & GraphQL:** Used for communicating with the backend API.
*   **Socket.IO:** Used for real-time communication in the chat.
*   **WebTorrent:** Used for P2P media delivery.
*   **Pinata:** Used as a fallback CDN for media delivery.

## How it Works

The heart of the Bubblebase application is the `neighborhood-chat.js` component. This component is responsible for displaying the chat for a specific Bubble, as well as handling the uploading and downloading of media.

When a user uploads a piece of media, it is first uploaded to IPFS and a CID is generated. The CID is then used to create a magnet link, which is shared with the other members of the Bubble. When another user wants to view the media, they use the magnet link to download it directly from the other users who are also viewing it.

The `WebTorrentMedia.js` component is responsible for handling the P2P media delivery. It uses the WebTorrent library to download and display media from other users.

The global WebTorrent client is initialized in the `app/+html.tsx` file. This ensures that the client is available to all components in the application.

## Livestreaming

Livestreaming in Bubblebase is still under development, but the goal is to use the same P2P-first approach as static media. The current implementation uses `blobinfo.js` as one way to livestream, but the plan is to move to a more robust solution that uses the Managed Media Player and Media Source Extensions (MSE) depending on the device. The idea is to swarm to an array of video data and play it back with a buffer.

For the fallback, the plan is to set up a system where the livestream is also uploaded to Pinata in real-time. This will ensure that users can still view the stream even if they are unable to connect to the P2P network.

### Future AI Instructions for Pinata Livestream Fallback

1.  **Set up a Pinata account:** If you don't already have one, create a Pinata account.
2.  **Generate an API key:** In the Pinata dashboard, generate a new API key with the ability to upload files.
3.  **Store the API key securely:** Store the API key in a secure location, such as a secret manager or environment variable.
4.  **Implement the fallback logic:** In the livestreaming component, add logic to upload the video chunks to Pinata in real-time. This can be done by using the Pinata API to upload each chunk as it is generated.
5.  **Provide the Pinata URL to viewers:** When a user is unable to connect to the P2P network, provide them with the URL to the Pinata stream. This can be done by using a manifest file that points to the different video chunks on Pinata.

This is a high-level overview of the Bubblebase project. For more information, please refer to the code and the comments within the code.
