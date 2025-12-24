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

  // Don't touch waiting/delayed jobs - they could be legitimate long-running workflows
  console.log('ℹ️  Leaving waiting/delayed jobs untouched (they may be legitimate long-running workflows)');
  
} catch (error) {
  console.error('Cleanup failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
