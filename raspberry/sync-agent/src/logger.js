const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { config } = require('./config');

const logDir = path.dirname(config.logging.path);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'neopro-sync-agent', siteId: config.site.id },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, service, siteId, ...meta }) => {
          const metaString = Object.keys(meta).length
            ? ' ' + JSON.stringify(meta)
            : '';
          return `${timestamp} [${level}]: ${message}${metaString}`;
        })
      ),
    }),
    new winston.transports.File({
      filename: config.logging.path,
      maxsize: 10485760,
      maxFiles: 5,
    }),
  ],
});

module.exports = logger;
