// A minimal, no-op service worker for PWA installation
self.addEventListener("install", (event) => {
  console.log("Service Worker installed");
});
self.addEventListener("fetch", (event) => {
  // You could add caching strategies here later
});
