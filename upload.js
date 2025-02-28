document.getElementById("uploadButton").addEventListener("click", () => {
  const file = document.getElementById("fileInput").files[0];
  const formData = new FormData();
  formData.append("video", file, file.name);
  fetch("http://localhost:3001/upload", {
    method: "POST",
    body: formData,
  }).then((response) => {
    // Handle response
  });
});
