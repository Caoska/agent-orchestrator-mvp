import { spawn } from 'child_process';

const serviceName = process.env.RAILWAY_SERVICE_NAME || '';
const isWorker = serviceName.toLowerCase().includes('worker');

// Run migrations before starting server (not worker)
if (!isWorker) {
  console.log('Running database migrations...');
  const migrate = spawn('node', ['migrate.js'], { stdio: 'inherit' });
  
  migrate.on('close', (code) => {
    if (code !== 0) {
      console.error('Migration failed, exiting');
      process.exit(1);
    }
    
    const script = 'server.js';
    console.log(`Starting ${script}`);
    spawn('node', [script], { stdio: 'inherit' });
  });
} else {
  const script = 'worker.js';
  console.log(`Starting ${script} (service: ${serviceName})`);
  spawn('node', [script], { stdio: 'inherit' });
}

