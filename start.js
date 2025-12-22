import { spawn } from 'child_process';

const serviceName = process.env.RAILWAY_SERVICE_NAME || '';
console.log(`Service name: ${serviceName}`);

// More specific worker detection
const isOrchestrator = serviceName.includes('orchestrator') && serviceName !== 'agent-orchestrator-mvp';
const isFastWorker = serviceName.includes('fast-worker');
const isSlowWorker = serviceName.includes('slow-worker');
const isWorker = isOrchestrator || isFastWorker || isSlowWorker;

console.log(`Worker detection: orchestrator=${isOrchestrator}, fast=${isFastWorker}, slow=${isSlowWorker}, isWorker=${isWorker}`);

// Run migrations before starting server (not worker)
if (!isWorker) {
  console.log('Running cleanup script...');
  const cleanup = spawn('node', ['scripts/cleanup-orphaned-jobs.js'], { stdio: 'inherit' });
  
  cleanup.on('close', (code) => {
    console.log('Cleanup completed, exiting');
    process.exit(0);
  });
} else {
  // Determine which worker to start
  let script;
  if (isFastWorker) {
    script = 'src/worker/fast-worker.js';
  } else if (isSlowWorker) {
    script = 'src/worker/slow-worker.js';
  } else if (isOrchestrator) {
    script = 'src/worker/orchestrator.js';
  } else {
    // Fallback to orchestrator
    script = 'src/worker/orchestrator.js';
  }
  
  console.log(`Starting ${script} (service: ${serviceName})`);
  spawn('node', [script], { stdio: 'inherit', env: process.env });
}

