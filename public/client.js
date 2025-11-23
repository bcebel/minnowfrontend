// public/webtorrent/webtorrent-loader.js
console.log('🌪️ Loading WebTorrent from public folder...');

// Load WebTorrent from CDN
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/webtorrent@latest/webtorrent.min.js';
script.onload = () => {
console.log('✅ WebTorrent loaded successfully');
// Dispatch event so your components know it's ready
window.dispatchEvent(new Event('webtorrent-loaded'));
};
document.head.appendChild(script);