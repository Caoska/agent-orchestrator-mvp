import { spawn } from 'child_process';

const serviceName = process.env.RAILWAY_SERVICE_NAME || '';
const isWorker = serviceName.toLowerCase().includes('worker');

const script = isWorker ? 'worker.js' : 'server.js';
console.log(`Starting ${script} (service: ${serviceName || 'unknown'})`);

spawn('node', [script], { stdio: 'inherit' });
