module.exports = {
  apps: [{
    name: 'law-fetcher',
    script: 'index.js',
    cwd: '/opt/law-fetcher',
    env: {
      PORT: 3100,
      SERVICE_KEY: 'law-fetcher-internal-key',
      NODE_ENV: 'production',
    },
    max_memory_restart: '512M',
    restart_delay: 5000,
  }],
};
