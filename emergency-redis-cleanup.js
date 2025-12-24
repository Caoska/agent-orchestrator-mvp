import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue("runs", { connection });

console.log('🧹 Starting aggressive Redis cleanup...');

try {
  // Get all repeatable jobs
  const repeatableJobs = await runQueue.getRepeatableJobs();
  console.log(`Found ${repeatableJobs.length} repeatable jobs`);

  let cleaned = 0;
  for (const job of repeatableJobs) {
    // Skip system jobs
    if (job.id === 'monthly_usage_reset' || job.id === 'orphaned_job_cleanup') {
      console.log(`Skipping system job: ${job.id}`);
      continue;
    }

    try {
      await runQueue.removeRepeatableByKey(job.key);
      console.log(`Removed: ${job.id || 'unnamed'} (key: ${job.key?.substring(0, 50)}...)`);
      cleaned++;
    } catch (error) {
      console.error(`Failed to remove job ${job.id}:`, error.message);
    }
  }

  console.log(`🎉 Cleanup complete! Removed ${cleaned} repeatable jobs`);

  // Also clear any waiting/delayed jobs that might be orphaned
  const waiting = await runQueue.getWaiting();
  const delayed = await runQueue.getDelayed();
  
  console.log(`Found ${waiting.length} waiting jobs and ${delayed.length} delayed jobs`);
  
  // Only clean jobs older than 24 hours to be safe
  const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
  let oldJobsCleaned = 0;
  
  for (const job of [...waiting, ...delayed]) {
    if (job.timestamp < oneDayAgo) {
      try {
        await job.remove();
        oldJobsCleaned++;
      } catch (error) {
        console.error(`Failed to remove old job ${job.id}:`, error.message);
      }
    }
  }
  
  console.log(`🎉 Removed ${oldJobsCleaned} jobs older than 24 hours`);
  
} catch (error) {
  console.error('Cleanup failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
