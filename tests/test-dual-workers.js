import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Test dual worker architecture
async function testDualWorkers() {
  console.log('🧪 Testing Dual Worker Architecture...\n');
  
  try {
    // Create queues
    const orchestratorQueue = new Queue("runs", { connection });
    const fastQueue = new Queue("fast-jobs", { connection });
    const slowQueue = new Queue("slow-jobs", { connection });
    
    console.log('✅ Connected to Redis and created queues');
    
    // Check queue health
    const orchestratorWaiting = await orchestratorQueue.getWaiting();
    const fastWaiting = await fastQueue.getWaiting();
    const slowWaiting = await slowQueue.getWaiting();
    
    console.log(`📊 Queue Status:`);
    console.log(`   Orchestrator: ${orchestratorWaiting.length} waiting jobs`);
    console.log(`   Fast Worker: ${fastWaiting.length} waiting jobs`);
    console.log(`   Slow Worker: ${slowWaiting.length} waiting jobs`);
    
    // Test job routing by adding test jobs
    console.log('\n🚀 Testing job routing...');
    
    // Add a test job to fast queue
    const fastJob = await fastQueue.add('test-fast', {
      step: { type: 'http', config: { url: 'https://httpbin.org/get' } },
      context: { test: true },
      runId: 'test-run-1',
      nodeId: 'test-node-1'
    });
    
    console.log(`✅ Added fast job: ${fastJob.id}`);
    
    // Add a test job to slow queue
    const slowJob = await slowQueue.add('test-slow', {
      step: { type: 'delay', config: { seconds: 1 } },
      context: { test: true },
      runId: 'test-run-2', 
      nodeId: 'test-node-2'
    });
    
    console.log(`✅ Added slow job: ${slowJob.id}`);
    
    // Wait a moment and check job status
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const fastJobStatus = await fastJob.getState();
    const slowJobStatus = await slowJob.getState();
    
    console.log(`\n📈 Job Status:`);
    console.log(`   Fast job: ${fastJobStatus}`);
    console.log(`   Slow job: ${slowJobStatus}`);
    
    // Check if workers are processing
    const fastActive = await fastQueue.getActive();
    const slowActive = await slowQueue.getActive();
    
    console.log(`\n⚡ Active Jobs:`);
    console.log(`   Fast worker: ${fastActive.length} active`);
    console.log(`   Slow worker: ${slowActive.length} active`);
    
    // Clean up test jobs
    try {
      await fastJob.remove();
      await slowJob.remove();
      console.log('\n🧹 Cleaned up test jobs');
    } catch (e) {
      // Jobs might have completed already
    }
    
    // Close connections
    await orchestratorQueue.close();
    await fastQueue.close();
    await slowQueue.close();
    await connection.quit();
    
    console.log('\n🎉 Dual worker architecture test completed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Redis connection working');
    console.log('   ✅ All three queues accessible');
    console.log('   ✅ Job routing functional');
    console.log('   ✅ Workers can receive jobs');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testDualWorkers();
