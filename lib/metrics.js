import client from 'prom-client';

// Create a Registry
const register = new client.Registry();

// Add default metrics
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});

const agentRunsTotal = new client.Counter({
  name: 'agent_runs_total',
  help: 'Total number of agent runs',
  labelNames: ['status', 'workspace_id']
});

const agentRunDuration = new client.Histogram({
  name: 'agent_run_duration_seconds',
  help: 'Duration of agent runs in seconds',
  labelNames: ['status', 'workspace_id'],
  buckets: [1, 5, 10, 30, 60, 300]
});

const queueDepth = new client.Gauge({
  name: 'queue_depth',
  help: 'Number of jobs in the queue',
  labelNames: ['queue_name']
});

const activeUsers = new client.Gauge({
  name: 'active_users_total',
  help: 'Number of active users by plan',
  labelNames: ['plan']
});

// Register metrics
register.registerMetric(httpRequestDuration);
register.registerMetric(httpRequestsTotal);
register.registerMetric(agentRunsTotal);
register.registerMetric(agentRunDuration);
register.registerMetric(queueDepth);
register.registerMetric(activeUsers);

// Middleware to track HTTP requests
export function metricsMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    
    httpRequestDuration
      .labels(req.method, route, res.statusCode)
      .observe(duration);
    
    httpRequestsTotal
      .labels(req.method, route, res.statusCode)
      .inc();
  });
  
  next();
}

// Track agent runs
export function trackAgentRun(status, workspaceId, durationSeconds) {
  agentRunsTotal.labels(status, workspaceId).inc();
  agentRunDuration.labels(status, workspaceId).observe(durationSeconds);
}

// Track queue depth
export function updateQueueDepth(queueName, depth) {
  queueDepth.labels(queueName).set(depth);
}

// Track active users
export function updateActiveUsers(plan, count) {
  activeUsers.labels(plan).set(count);
}

export { register };
