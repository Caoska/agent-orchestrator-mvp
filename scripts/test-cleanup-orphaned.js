import { cleanupOrphanedJobsForAgent } from './lib/scheduler.js';

const orphanedAgentIds = [
  'agent_9a042979-b9d1-4e5b-991c-a08c911837a0',
  'agent_2ce124e3-cf8d-4281-8fd7-ae8cb55d5f03'
];

console.log('Testing cleanup for orphaned agents...');

async function runCleanup() {
  try {
    for (const agentId of orphanedAgentIds) {
      try {
        console.log(`\nCleaning up jobs for ${agentId}...`);
        const cleaned = await cleanupOrphanedJobsForAgent(agentId);
        console.log(`Cleaned up ${cleaned} jobs for ${agentId}`);
      } catch (error) {
        console.error(`Failed to cleanup ${agentId}:`, error.message);
      }
    }
    console.log('\nCleanup test completed');
  } catch (error) {
    console.error('Cleanup failed:', error.message);
  } finally {
    process.exit(0);
  }
}

runCleanup();
