import { getDb } from './db.js';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL);

export async function checkHealth() {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Check database
  try {
    const db = getDb();
    if (db) {
      await db.query('SELECT 1');
      health.services.database = { status: 'healthy' };
    } else {
      health.services.database = { status: 'unavailable', error: 'No database connection' };
    }
  } catch (error) {
    health.services.database = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  // Check Redis
  try {
    await redis.ping();
    health.services.redis = { status: 'healthy' };
  } catch (error) {
    health.services.redis = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  // Check queue
  try {
    const queueInfo = await redis.llen('bull:runs:waiting');
    health.services.queue = { 
      status: 'healthy', 
      depth: queueInfo,
      warning: queueInfo > 100 ? 'High queue depth' : null
    };
    
    if (queueInfo > 1000) {
      health.status = 'degraded';
    }
  } catch (error) {
    health.services.queue = { status: 'unhealthy', error: error.message };
    health.status = 'degraded';
  }

  // Overall health
  const unhealthyServices = Object.values(health.services)
    .filter(service => service.status === 'unhealthy').length;
  
  if (unhealthyServices > 0) {
    health.status = unhealthyServices === Object.keys(health.services).length ? 'unhealthy' : 'degraded';
  }

  return health;
}
