module.exports = {
  apps: [
    {
      name: 'Journal',
      script: '/home/Journal/server/server.js',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 4002
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 4002
      }
    }
  ]
};
