import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://red-ctlhbhij1k6c73a6nnag:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

async function listScheduledJobs() {
  const repeatableJobs = await runQueue.getRepeatableJobs();
  console.log(`Total scheduled jobs in Redis: ${repeatableJobs.length}`);
  
  repeatableJobs.forEach(job => {
    console.log(`- ${job.id || 'unnamed'} (${job.pattern || job.every})`);
  });
  
  process.exit(0);
}

listScheduledJobs().catch(console.error);
