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
  poweredByHeader: false,
  experimental: {
    serverActions: {},
  },
  async headers() {
    const securityHeaders = [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
      { key: 'Content-Security-Policy-Report-Only', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self';" },
    ];
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      {
        // Dynamic pages — no CDN/proxy caching
        source: '/((?!_next/static|_next/image|favicon.ico).*)',
        headers: [
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
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