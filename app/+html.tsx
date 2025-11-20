export default function
  Root({ children }) {
    return (
      <html lang="en">
      <head>
      <meta charSet="utf-8" />
        <meta name = "viewport"
          content ="width=device-width, initial-scale-1" />

        <link rel = "preconnect"
          href="https://cdn.jsdelivr.net" />

        <script src ="https://cdn.jsdelivr.net/npm/webrtorrent@latest/webtorrent.min.js" />    
      <script dangerouslySetHTML={{__html: ` if (! window.globalWebTorrentClient) {window.globalWebTorrentClient = new WebTorrent();} `
                                  }} />
      
      </head>
      <body>
        {children}
      </body>
      </html>
        );
  }  
