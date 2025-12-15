import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'agent-orchestrator' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Add correlation ID to all logs
export function createRequestLogger(correlationId, userId = null) {
  return logger.child({ 
    correlationId, 
    userId,
    timestamp: new Date().toISOString()
  });
}

export { logger };
