import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

// Force development mode if not specified to ensure Vite runs in this environment
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'development';
}

async function startServer() {
  const app = express();

  const getPort = () => {
    if (process.env.PORT) return parseInt(process.env.PORT, 10);
    const args = process.argv.slice(2);
    const portIndex = args.indexOf('--port');
    if (portIndex > -1 && args[portIndex + 1]) {
      return parseInt(args[portIndex + 1], 10);
    }
    return 3000;
  };
  const PORT = getPort();


  // JSON middleware
  app.use(express.json());

  // OAuth endpoints
  app.get("/api/auth/google/url", (req, res) => {
    // Generate Google OAuth URL for Calendar and Chat
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: `${process.env.APP_URL || 'http://localhost:3000'}/auth/callback`,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/chat.spaces',
      access_type: 'offline',
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ url: authUrl });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    
    // In a real scenario, you'd exchange the code for tokens using googleapis here:
    // const { tokens } = await oauth2Client.getToken(code);
    // and save the tokens to the database.

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Autenticação do Google concluída. Esta janela fechará automaticamente.</p>
        </body>
      </html>
    `);
  });

  // Vite middleware for development
  console.log(`Starting in ${process.env.NODE_ENV || 'development'} mode`);
  
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite dev server...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    // Use vite's connect instance as middleware
    app.use(vite.middlewares);

    // Explicitly serve index.html for all other routes in dev
    app.get('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });

    console.log("Vite middleware and catch-all loaded.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
