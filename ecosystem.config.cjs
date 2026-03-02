module.exports = {
  apps: [
    {
      name: "tesla-mqtt",
      script: "pnpm",
      args: "dev mqtt listen --car-id 1",
      // Pin cwd so pnpm/tsx always runs in the repo with package.json.
      cwd: "/Users/fox/Documents/fly/tesla-service",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      error_file: "./logs/mqtt-error.log",
      out_file: "./logs/mqtt-out.log",
    },
  ],
};
