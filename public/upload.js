document.addEventListener("DOMContentLoaded", () => {
  const fileInput = document.getElementById("fileInput");
  const uploadButton = document.getElementById("uploadButton");
  const messageDiv = document.getElementById("message");

  uploadButton.addEventListener("click", () => {
    const file = fileInput.files[0];
    if (!file) {
      messageDiv.textContent = "Please select a file.";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    fetch("/upload", {
      // Replace with your backend endpoint
      method: "POST",
      body: formData,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Upload failed");
        }
        return response.json();
      })
      .then((data) => {
        messageDiv.textContent = `Upload successful! CID: ${data.cid}`;
      })
      .catch((error) => {
        console.error(error);
        messageDiv.textContent = error.message;
      });
  });
});
