import IORedis from "ioredis";
import { Queue } from "bullmq";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function clearQueues() {
  console.log('🧹 Clearing all queues...');
  
  const queues = ['runs', 'fast-jobs', 'slow-jobs'];
  
  for (const queueName of queues) {
    const queue = new Queue(queueName, { connection });
    
    // Clear all jobs
    await queue.obliterate({ force: true });
    console.log(`✅ Cleared queue: ${queueName}`);
  }
  
  console.log('🎉 All queues cleared!');
  process.exit(0);
}

clearQueues().catch(console.error);
