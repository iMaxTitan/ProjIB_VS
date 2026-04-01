const { createServer } = require('https');
const http = require('http');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({
  dev,
  hostname: 'maxtitan.me',
  port: 443
});
const handle = app.getRequestHandler();

const certPath = path.join(__dirname, 'certificates/maxtitan.pem');
const keyPath = path.join(__dirname, 'certificates/maxtitan-key.pem');

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

// n8n proxy target (local)
const N8N_PORT = parseInt(process.env.N8N_PORT || '5678', 10);

app.prepare().then(() => {
  const server = createServer(httpsOptions, async (req, res) => {
    // Устанавливаем CORS заголовки для *всех* ответов
    res.setHeader('Access-Control-Allow-Origin', 'https://maxtitan.me');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization, apikey, Prefer, Range');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Location');

    // Обработка preflight запросов OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(204); // No Content
      res.end();
      return;
    }

    // /rest/v1 — blocked, use /api/db/ proxy with auth
    if (req.url.startsWith('/rest/v1')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Proxy /n8n/* to local n8n instance
    if (req.url.startsWith('/n8n')) {
      const n8nReq = http.request({
        hostname: '127.0.0.1',
        port: N8N_PORT,
        path: req.url,
        method: req.method,
        headers: { ...req.headers, host: `127.0.0.1:${N8N_PORT}` },
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
      });
      n8nReq.on('error', (err) => {
        console.error('n8n proxy error:', err.message);
        res.writeHead(502);
        res.end('n8n unavailable');
      });
      req.pipe(n8nReq, { end: true });
      return;
    }

    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  const port = parseInt(process.env.PORT || '443', 10);
  server.listen(port, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log(`> Ready on https://0.0.0.0:${port} (доступен как https://maxtitan.me:${port})`);
  });
}).catch(err => {
  console.error('Error occurred starting server:', err);
});