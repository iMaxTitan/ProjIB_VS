const https = require('https');
const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, 'certificates/maxtitan.pem');
const keyPath = path.join(__dirname, 'certificates/maxtitan-key.pem');

const server = https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
}, (req, res) => {
  const options = {
    hostname: '10.0.0.3',
    port: 8080,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: 'localhost:8080' },
    rejectUnauthorized: false,
  };
  const proxy = https.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxy.on('error', (e) => {
    console.error('Proxy error:', e.message);
    res.writeHead(502);
    res.end('Bad Gateway');
  });
  req.pipe(proxy, { end: true });
});

// WebSocket upgrade for Next.js HMR
server.on('upgrade', (req, socket, head) => {
  const options = {
    hostname: '10.0.0.3',
    port: 8080,
    path: req.url,
    method: 'GET',
    headers: { ...req.headers, host: 'localhost:8080' },
    rejectUnauthorized: false,
  };
  const proxy = https.request(options);
  proxy.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
    socket.write('HTTP/1.1 101 Switching Protocols\r\n' +
      Object.entries(proxyRes.headers).map(([k, v]) => k + ': ' + v).join('\r\n') +
      '\r\n\r\n');
    if (proxyHead.length) socket.write(proxyHead);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
  });
  proxy.on('error', (e) => {
    console.error('WS proxy error:', e.message);
    socket.end();
  });
  proxy.end();
});

server.listen(8080, () => {
  console.log('Dev proxy: https://maxtitan.me:8080 -> https://10.0.0.3:8080');
});
