import { spawn } from 'child_process';

const serviceName = process.env.RAILWAY_SERVICE_NAME || '';
const isWorker = serviceName.toLowerCase().includes('worker');
const isOrchestrator = serviceName.toLowerCase().includes('orchestrator');

// Run migrations before starting server (not worker)
if (!isWorker && !isOrchestrator) {
  console.log('Running database migrations...');
  const migrate = spawn('node', ['src/db/migrate.js'], { stdio: 'inherit' });
  
  migrate.on('close', (code) => {
    if (code !== 0) {
      console.error('Migration failed, exiting');
      process.exit(1);
    }
    
    const script = 'src/server/index.js';
    console.log(`Starting ${script}`);
    spawn('node', [script], { stdio: 'inherit', env: process.env });
  });
} else {
  // Determine which worker to start
  let script;
  if (serviceName.includes('fast-worker')) {
    script = 'src/worker/fast-worker.js';
  } else if (serviceName.includes('slow-worker')) {
    script = 'src/worker/slow-worker.js';
  } else if (serviceName.includes('orchestrator')) {
    script = 'src/worker/orchestrator.js';
  } else {
    // Default to orchestrator for backward compatibility
    script = 'src/worker/orchestrator.js';
  }
  
  console.log(`Starting ${script} (service: ${serviceName})`);
  spawn('node', [script], { stdio: 'inherit', env: process.env });
}

