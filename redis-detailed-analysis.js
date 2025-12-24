import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

console.log('🔍 Analyzing remaining Redis data...');

try {
  // Get all keys and group by pattern
  const allKeys = await connection.keys('*');
  console.log(`🔑 Total keys: ${allKeys.length}`);
  
  const keyPatterns = {};
  const keyDetails = {};
  
  for (const key of allKeys) {
    const pattern = key.split(':').slice(0, 2).join(':') + ':*';
    keyPatterns[pattern] = (keyPatterns[pattern] || 0) + 1;
    
    // Get memory usage for first few keys of each pattern
    if (!keyDetails[pattern] || keyDetails[pattern].length < 3) {
      const type = await connection.type(key);
      const memory = await connection.memory('usage', key);
      const ttl = await connection.ttl(key);
      
      if (!keyDetails[pattern]) keyDetails[pattern] = [];
      keyDetails[pattern].push({ key, type, memory, ttl });
    }
  }
  
  console.log('\n📊 Key patterns by count:');
  Object.entries(keyPatterns)
    .sort(([,a], [,b]) => b - a)
    .forEach(([pattern, count]) => {
      console.log(`  ${pattern}: ${count} keys`);
      
      // Show details for top patterns
      if (keyDetails[pattern]) {
        keyDetails[pattern].forEach(detail => {
          const ttlInfo = detail.ttl === -1 ? 'no expiry' : detail.ttl === -2 ? 'expired' : `${detail.ttl}s TTL`;
          console.log(`    └─ ${detail.key.substring(0, 60)}... (${detail.type}, ${detail.memory} bytes, ${ttlInfo})`);
        });
      }
    });

  // Calculate total memory usage
  let totalMemory = 0;
  for (const key of allKeys.slice(0, 100)) { // Sample first 100 keys
    try {
      const memory = await connection.memory('usage', key);
      totalMemory += memory;
    } catch (e) {
      // Skip keys that can't be measured
    }
  }
  
  const avgMemoryPerKey = totalMemory / Math.min(100, allKeys.length);
  const estimatedTotalMemory = avgMemoryPerKey * allKeys.length;
  
  console.log(`\n💾 Estimated total memory: ${Math.round(estimatedTotalMemory / 1024 / 1024)} MB`);
  console.log(`📈 Average per key: ${Math.round(avgMemoryPerKey)} bytes`);

} catch (error) {
  console.error('Analysis failed:', error.message);
} finally {
  await connection.quit();
  process.exit(0);
}
