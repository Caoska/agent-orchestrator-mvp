import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log('🔍 IMMEDIATE Redis analysis after flush...');

try {
  const keys = await connection.keys('*');
  console.log(`📊 Total keys: ${keys.length}`);
  
  if (keys.length > 0) {
    console.log('🚨 Keys found immediately after flush:');
    for (const key of keys.slice(0, 20)) {
      const type = await connection.type(key);
      const memory = await connection.memory('usage', key);
      const ttl = await connection.ttl(key);
      console.log(`  ${key} (${type}, ${memory} bytes, TTL: ${ttl})`);
    }
  }
  
} catch (error) {
  console.error('Analysis failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
