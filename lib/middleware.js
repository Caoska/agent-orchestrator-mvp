import { v4 as uuidv4 } from 'uuid';
import { createRequestLogger } from './logger.js';

// Add correlation ID to all requests
export function correlationMiddleware(req, res, next) {
  const correlationId = req.headers['x-correlation-id'] || uuidv4();
  req.correlationId = correlationId;
  req.logger = createRequestLogger(correlationId, req.workspace?.workspace_id);
  
  res.setHeader('X-Correlation-ID', correlationId);
  
  req.logger.info('Request started', {
    method: req.method,
    url: req.url,
    userAgent: req.headers['user-agent'],
    ip: req.ip
  });
  
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    req.logger.info('Request completed', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration
    });
  });
  
  next();
}

// Enhanced error handling with logging
export function errorHandler(err, req, res, next) {
  const logger = req.logger || createRequestLogger('unknown');
  
  logger.error('Request failed', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url
  });
  
  res.status(500).json({
    error: 'Internal server error',
    correlationId: req.correlationId
  });
}
