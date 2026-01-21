class WebTorrentService {
  constructor() {
    // Stick to the trackers defined in your +html.tsx for consistency
    this.trackers = window.enhancedTrackers || [
      "wss://tracker-0ad4cca9fd92.herokuapp.com",

    ];
  }

  // THE CHAMP GATEKEEPER
  async ensureClient() {
    let attempts = 0;
    // Wait for the +html.tsx script to finish its work
    while (!window.globalWebTorrentClient && attempts < 20) {
      console.log(`⏳ Waiting for Champ (Attempt ${attempts})...`);
      await new Promise((r) => setTimeout(r, 500));
      attempts++;
    }

    if (!window.globalWebTorrentClient) {
      throw new Error("WebTorrent Champ failed to enter the building.");
    }

    return window.globalWebTorrentClient;
  }

  // Simplified Seed
  async seed(data, options = {}) {
    const client = await this.ensureClient();
    return new Promise((resolve) => {
      client.seed(
        data,
        {
          ...options,
          announce: this.trackers,
        },
        (torrent) => {
          console.log("🌱 Champ is seeding:", torrent.name);
          resolve(torrent);
        }
      );
    });
  }

  // Simplified Add
  async add(magnetUri, options = {}) {
    const client = await this.ensureClient();

    // Check if we already have this torrent to avoid errors
    const existing = client.get(magnetUri);
    if (existing) return existing;

    return new Promise((resolve) => {
      client.add(
        magnetUri,
        {
          ...options,
          announce: this.trackers,
        },
        (torrent) => {
          resolve(torrent);
        }
      );
    });
  }

  // Simple cleanup
  cleanup(filter = "") {
    if (!window.globalWebTorrentClient) return;
    window.globalWebTorrentClient.torrents.forEach((t) => {
      if (!filter || t.name.includes(filter)) {
        t.destroy();
      }
    });
  }
}

const webtorrentService = new WebTorrentService();
export default webtorrentService;
