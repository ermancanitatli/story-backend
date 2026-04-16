module.exports = {
  apps: [
    {
      name: 'story-backend',
      script: 'dist/main.js',
      instances: 4,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'prod',
      },
      // Graceful shutdown
      kill_timeout: 5000,
      wait_ready: true,
      listen_timeout: 10000,
    },
  ],
};
