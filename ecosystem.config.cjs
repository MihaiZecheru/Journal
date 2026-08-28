module.exports = {
  apps: [
    {
      name: 'Journal',
      script: "npm",
      args: "start",
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
