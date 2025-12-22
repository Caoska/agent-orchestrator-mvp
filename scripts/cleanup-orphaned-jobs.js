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
  
  // Debug: show first few jobs
  console.log('Sample jobs:', repeatableJobs.slice(0, 3).map(j => ({ id: j.id, data: j.data })));
  
  // Get all valid agent IDs from database
  const validAgents = await data.listAgents();
  console.log(`Found ${validAgents.length} valid agents in database`);
  const validAgentIds = new Set(validAgents.map(a => a.agent_id));
  
  let removedCount = 0;
  
  for (const job of repeatableJobs) {
    if (job.id && job.id.startsWith('schedule_')) {
      // Extract agent_id from job data or check if agent exists
      const jobData = job.data || {};
      const agentId = jobData.agent_id;
      
      if (!agentId || !validAgentIds.has(agentId)) {
        console.log(`Removing orphaned job: ${job.id} (agent: ${agentId || 'unknown'})`);
        try {
          await runQueue.removeRepeatableByKey(job.key);
          removedCount++;
        } catch (error) {
          console.error(`Failed to remove job ${job.id}:`, error.message);
        }
      }
    }
  }
  
  console.log(`Cleanup complete. Removed ${removedCount} orphaned jobs.`);
  process.exit(0);
}

cleanupOrphanedJobs().catch(console.error);
