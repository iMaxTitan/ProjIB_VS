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
  // Виключаємо pdfkit з бандлу - він потребує AFM файли
  serverExternalPackages: ['pdfkit'],
  // Возвращаем отключение HMR через webpack poll
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Используем режим polling для обхода проблем с WebSocket через HTTPS/домен
      config.watchOptions = {
        poll: 1000, // Проверка изменений каждую секунду
        aggregateTimeout: 300, // Задержка перед пересборкой
      };
    }
    return config;
  },
};

module.exports = nextConfig;