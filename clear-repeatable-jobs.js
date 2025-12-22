import IORedis from "ioredis";
import { Queue } from "bullmq";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function clearAllRepeatableJobs() {
  console.log('🧹 Clearing all repeatable jobs...');
  
  const queue = new Queue('runs', { connection });
  
  try {
    // Get all repeatable jobs
    const repeatableJobs = await queue.getRepeatableJobs();
    console.log(`Found ${repeatableJobs.length} repeatable jobs`);
    
    // Remove each one
    for (const job of repeatableJobs) {
      try {
        await queue.removeRepeatableByKey(job.key);
        console.log(`✅ Removed job: ${job.id}`);
      } catch (error) {
        console.log(`❌ Failed to remove job ${job.id}:`, error.message);
      }
    }
    
    // Also obliterate the queue to be sure
    await queue.obliterate({ force: true });
    console.log('✅ Queue obliterated');
    
    console.log('🎉 All repeatable jobs cleared!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await connection.quit();
    process.exit(0);
  }
}

clearAllRepeatableJobs().catch(console.error);
