import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://redis-12345.c1.us-east-1-2.ec2.redislabs.com:12345';
const connection = new IORedis(REDIS_URL);
const queue = new Queue('runs', { connection });

try {
  const jobs = await queue.getRepeatableJobs();
  console.log('Repeatable jobs:', jobs.length);
  
  jobs.forEach((job, i) => {
    console.log(`${i + 1}. Job ID: ${job.id}`);
    console.log(`   Pattern: ${job.pattern || job.every}`);
    console.log(`   Key: ${job.key.substring(0, 80)}...`);
    console.log('');
  });
  
  if (jobs.length === 0) {
    console.log('No repeatable jobs found.');
  }
} catch (error) {
  console.error('Error:', error.message);
} finally {
  await connection.quit();
}
