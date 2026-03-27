const fs = require('fs');
const path = require('path');

const certPath = path.join(__dirname, 'certs/cert.pem');
const keyPath = path.join(__dirname, 'certs/key.pem');

const httpsConfig = fs.existsSync(certPath) && fs.existsSync(keyPath)
  ? {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    }
  : null;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {}, 
  },
  // Убираем async headers, так как будем настраивать CORS в server.js
  // async headers() { ... },
  allowedDevOrigins: [
    'https://maxtitan.me:3000',
    'https://localhost:3000',
    'https://127.0.0.1:3000'
  ],
  env: {
    NEXT_PUBLIC_USE_HTTPS: 'true',
    NEXT_PUBLIC_BASE_URL: 'https://maxtitan.me:3000'
  },
  // Виключаємо з бандлу пакети, що потребують Node.js APIs
  serverExternalPackages: ['pdfkit', 'docxtemplater', 'pizzip', 'pdf-parse'],
  // Polling для обхода проблем с WebSocket через HTTPS/домен
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      config.watchOptions = {
        poll: 3000, // Проверка изменений каждые 3 секунды (экономия памяти vs 1s)
        aggregateTimeout: 500,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      };
    }
    return config;
  },
};

module.exports = nextConfig;