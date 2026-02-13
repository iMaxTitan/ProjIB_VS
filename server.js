const { createServer } = require('https');
const { parse } = require('url');
const next = require('next');
const fs = require('fs');
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ 
  dev, 
  hostname: 'maxtitan.me', 
  port: 3000 
});
const handle = app.getRequestHandler();

const certPath = path.join(__dirname, 'certificates/localhost.pem');
const keyPath = path.join(__dirname, 'certificates/localhost-key.pem');

const httpsOptions = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
};

app.prepare().then(() => {
  const server = createServer(httpsOptions, async (req, res) => {
    // Устанавливаем CORS заголовки для *всех* ответов
    res.setHeader('Access-Control-Allow-Origin', 'https://maxtitan.me:3000'); 
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With, Content-Type, Accept, Authorization'); 
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Обработка preflight запросов OPTIONS
    if (req.method === 'OPTIONS') {
      res.writeHead(204); // No Content
      res.end();
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

  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen(port, '0.0.0.0', (err) => {
    if (err) throw err;
    console.log(`> Ready on https://0.0.0.0:${port} (доступен как https://maxtitan.me:${port})`);
  });
}).catch(err => {
  console.error('Error occurred starting server:', err);
});