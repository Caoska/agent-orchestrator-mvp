import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue("runs", { connection });

console.log('🧹 Starting comprehensive Redis cleanup...');

try {
  let totalCleaned = 0;

  // 1. Clean all failed jobs (8,347 of them!)
  console.log('Cleaning failed jobs...');
  const failed = await runQueue.getFailed();
  console.log(`Found ${failed.length} failed jobs`);
  
  for (const job of failed) {
    try {
      await job.remove();
      totalCleaned++;
    } catch (error) {
      console.error(`Failed to remove job ${job.id}:`, error.message);
    }
  }
  
  // 2. Clean completed jobs
  console.log('Cleaning completed jobs...');
  const completed = await runQueue.getCompleted();
  console.log(`Found ${completed.length} completed jobs`);
  
  for (const job of completed) {
    try {
      await job.remove();
      totalCleaned++;
    } catch (error) {
      console.error(`Failed to remove job ${job.id}:`, error.message);
    }
  }

  // 3. Clean old run data (run:* keys)
  console.log('Cleaning run data...');
  const runKeys = await connection.keys('run:*');
  console.log(`Found ${runKeys.length} run keys`);
  
  if (runKeys.length > 0) {
    await connection.del(...runKeys);
    totalCleaned += runKeys.length;
  }

  // 4. Clean orphaned bull repeat keys
  console.log('Cleaning orphaned repeat keys...');
  const repeatKeys = await connection.keys('bull:runs:repeat:*');
  console.log(`Found ${repeatKeys.length} repeat keys`);
  
  if (repeatKeys.length > 0) {
    await connection.del(...repeatKeys);
    totalCleaned += repeatKeys.length;
  }

  console.log(`🎉 Comprehensive cleanup complete! Removed ${totalCleaned} items`);
  
} catch (error) {
  console.error('Cleanup failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
