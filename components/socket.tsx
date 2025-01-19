import React, { useEffect, useState } from "react";
import { io } from "socket.io-client";

const Chat = ({ token }) => {
  const [socket, setSocket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");
  const [room, setRoom] = useState("default-room");

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io("http://localhost:3001", {
      auth: { token },
    });

    // Listen for incoming messages
    newSocket.on("message", (msg) => {
      setMessages((prevMessages) => [...prevMessages, msg]);
    });

    // Handle connection errors
    newSocket.on("connect_error", (err) => {
      console.error("Connection error:", err.message);
    });

    setSocket(newSocket);

    // Cleanup on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, [token]);

  const joinRoom = () => {
    if (socket) socket.emit("join-room", room);
  };

  const sendMessage = () => {
    if (socket) {
      socket.emit("message", {
        room,
        content: message,
        imageUrl: null, // Optional image URL
      });
      setMessage(""); // Clear input
    }
  };

  return (
    <div>
      <h1>Chat</h1>

      <div>
        <input
          type="text"
          placeholder="Room name"
          value={room}
          onChange={(e) => setRoom(e.target.value)}
        />
        <button onClick={joinRoom}>Join Room</button>
      </div>

      <div>
        <input
          type="text"
          placeholder="Type a message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button onClick={sendMessage}>Send</button>
      </div>

      <div>
        <h2>Messages</h2>
        <ul>
          {messages.map((msg, index) => (
            <li key={index}>
              <strong>{msg.sender.username}:</strong> {msg.content}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Chat;
