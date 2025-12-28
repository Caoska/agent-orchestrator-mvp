import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue("runs", { connection });

console.log('🔍 Analyzing Redis contents...');

try {
  // Check different job states
  const waiting = await runQueue.getWaiting();
  const active = await runQueue.getActive();
  const completed = await runQueue.getCompleted();
  const failed = await runQueue.getFailed();
  const delayed = await runQueue.getDelayed();
  
  console.log(`📊 Job counts:`);
  console.log(`  Waiting: ${waiting.length}`);
  console.log(`  Active: ${active.length}`);
  console.log(`  Completed: ${completed.length}`);
  console.log(`  Failed: ${failed.length}`);
  console.log(`  Delayed: ${delayed.length}`);
  
  // Check Redis keys
  const allKeys = await connection.keys('*');
  console.log(`\n🔑 Total Redis keys: ${allKeys.length}`);
  
  // Group keys by pattern
  const keyPatterns = {};
  allKeys.forEach(key => {
    const pattern = key.split(':')[0] + ':*';
    keyPatterns[pattern] = (keyPatterns[pattern] || 0) + 1;
  });
  
  console.log('\n📋 Key patterns:');
  Object.entries(keyPatterns)
    .sort(([,a], [,b]) => b - a)
    .forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count} keys`);
    });
  
  // Sample some keys to see what they contain
  console.log('\n🔍 Sample keys:');
  const sampleKeys = allKeys.slice(0, 10);
  for (const key of sampleKeys) {
    const type = await connection.type(key);
    const size = await connection.memory('usage', key);
    console.log(`  ${key} (${type}, ${size} bytes)`);
  }
  
} catch (error) {
  console.error('Analysis failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
