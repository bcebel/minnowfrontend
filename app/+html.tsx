import { ScrollViewStyleReset }
  from 'expo-router/html';
import { type  PropswithChildren } 
  from 'react';


export default function
  Root({ children }:
       PropsWithChildren) 
       {
    
    return (
      <html lang="en">
      <head>
      <meta charSet="utf-8" />
        <meta name = "viewport"
          content ="width=device-width, initial-scale-1, shrink-to-fit=no" />
<ScrollViewStyleReset />
        
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
