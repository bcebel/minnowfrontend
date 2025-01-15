import React from "react";

const Welcome = () => {
  return (
    <div style={myStyles}>
      <h1>Welcome!</h1>
      <p>You are successfully logged in.</p>
    </div>
  );
};

  const myStyles = {
    textAlign: "center",
    marginTop: "2rem",
    color: "#F43596",
  };
export default Welcome;
