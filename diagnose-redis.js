import IORedis from "ioredis";
import { Queue } from "bullmq";
import dotenv from 'dotenv';

dotenv.config();

// Use Railway Redis URL - this should be set in Railway environment
const REDIS_URL = process.env.REDIS_URL;

console.log('🔍 Connecting to Redis:', REDIS_URL.replace(/:[^:]*@/, ':***@'));

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function diagnoseRedis() {
  try {
    const queue = new Queue('runs', { connection });
    
    // Get repeatable jobs
    const repeatableJobs = await queue.getRepeatableJobs();
    console.log(`\n📊 Found ${repeatableJobs.length} repeatable jobs:`);
    
    repeatableJobs.forEach((job, i) => {
      console.log(`${i + 1}. ID: ${job.id}`);
      console.log(`   Pattern: ${job.pattern || job.every}`);
      console.log(`   Next run: ${new Date(job.next)}`);
      console.log(`   Key: ${job.key.substring(0, 60)}...`);
      console.log('');
    });
    
    // Get waiting jobs
    const waitingJobs = await queue.getWaiting();
    console.log(`📋 Waiting jobs: ${waitingJobs.length}`);
    
    // Get active jobs  
    const activeJobs = await queue.getActive();
    console.log(`⚡ Active jobs: ${activeJobs.length}`);
    
    // Get failed jobs
    const failedJobs = await queue.getFailed();
    console.log(`❌ Failed jobs: ${failedJobs.length}`);
    
    if (failedJobs.length > 0) {
      console.log('\nRecent failed jobs:');
      failedJobs.slice(0, 3).forEach((job, i) => {
        console.log(`${i + 1}. ${job.name} - ${job.failedReason}`);
        console.log(`   Data:`, JSON.stringify(job.data, null, 2));
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.quit();
  }
}

diagnoseRedis().catch(console.error);
