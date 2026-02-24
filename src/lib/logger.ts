import pino from 'pino';

/**
 * Creates a child logger with a specific component name
 *
 * Usage:
 *   const logger = createLogger('rss-parser');
 *   logger.info({ feedUrl }, 'Fetching feed');
 *   logger.error({ error: err.message }, 'Failed to fetch');
 */
export function createLogger(component: string) {
  return baseLogger.child({ component });
}

// Base logger configuration
const baseLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    env: process.env.NODE_ENV,
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
});

export default baseLogger;
