import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log('🧹 FLUSHING ALL REDIS DATA...');

try {
  await connection.flushall();
  console.log('✅ Redis completely cleared');
  
  // Verify it's empty
  const keys = await connection.keys('*');
  console.log(`🔍 Remaining keys after flush: ${keys.length}`);
  
} catch (error) {
  console.error('❌ Flush failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
