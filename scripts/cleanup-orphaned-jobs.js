import { Queue } from "bullmq";
import IORedis from "ioredis";
import * as data from "../lib/data.js";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://red-ctlhbhij1k6c73a6nnag:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

async function cleanupOrphanedJobs() {
  console.log("Cleaning up orphaned scheduled jobs...");
  
  // Get all repeatable jobs from BullMQ
  const repeatableJobs = await runQueue.getRepeatableJobs();
  console.log(`Found ${repeatableJobs.length} scheduled jobs in Redis`);
  
  // Get all valid schedule IDs from database
  const validSchedules = await data.listSchedules();
  const validScheduleIds = new Set(validSchedules.map(s => `schedule_${s.schedule_id}`));
  
  let removedCount = 0;
  
  for (const job of repeatableJobs) {
    if (job.id && job.id.startsWith('schedule_') && !validScheduleIds.has(job.id)) {
      console.log(`Removing orphaned job: ${job.id}`);
      try {
        await runQueue.removeRepeatableByKey(job.key);
        removedCount++;
      } catch (error) {
        console.error(`Failed to remove job ${job.id}:`, error.message);
      }
    }
  }
  
  console.log(`Cleanup complete. Removed ${removedCount} orphaned jobs.`);
  process.exit(0);
}

cleanupOrphanedJobs().catch(console.error);
