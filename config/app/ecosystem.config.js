module.exports = {
  apps : [{
    name: "pumpcantfun",
    script: "src/index.js",
    watch: false,
    env: {
      NODE_ENV: "production",
    },
    // Restart the app if it uses too much memory
    max_memory_restart: "1G",
    // Auto restart if app crashes
    autorestart: true,
    // Number of seconds to wait before restarting a crashed app
    restart_delay: 5000,
    // Keep the app alive even if it crashes
    max_restarts: 10,
    // Restart the app if it doesn't make any requests for 60 seconds
    exp_backoff_restart_delay: 100,
    // Log settings
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    error_file: "logs/err.log",
    out_file: "logs/out.log",
    merge_logs: true,
    // Graceful shutdown
    kill_timeout: 5000
  }]
} 