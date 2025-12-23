import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { executeDelayTool, executeDatabaseTool } from "../../lib/tools.js";
import { initDb } from "../../lib/db.js";
import * as data from "../../lib/data.js";
import { trackAgentRun, updateQueueDepth } from "../../lib/metrics.js";
import { logger } from "../../lib/logger.js";

dotenv.config();
await initDb();

const REDIS_URL = process.env.REDIS_URL;
const SLOW_QUEUE_NAME = "slow-jobs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Slow tools that may take time or involve polling/waiting
const SLOW_TOOLS = ['delay', 'database-poll', 'retry'];

async function executeStep(step, context) {
  const toolMap = {
    delay: executeDelayTool,
    database: executeDatabaseTool,
    'database-poll': executeDatabaseTool // Alias for polling operations
  };
  
  const executor = toolMap[step.type || step.tool];
  if (!executor) {
    throw new Error(`Unknown step type: ${step.type || step.tool}`);
  }
  
  // Add timestamp to context for all tools
  const contextWithTimestamp = {
    ...context,
    timestamp: new Date().toISOString()
  };
  
  return await executor(step.config, contextWithTimestamp);
}

const slowWorker = new Worker(
  SLOW_QUEUE_NAME,
  async job => {
    const { step, context, runId, nodeId } = job.data;
    
    // Create display name: "Tool Type (Custom Name)" or just "Tool Type"
    const toolType = step.type || step.tool || 'Unknown';
    const customName = step.config?.name;
    const displayName = customName ? `${toolType} (${customName})` : toolType;
    
    const jobLogger = logger.child({ runId, nodeId, stepType: step.type, displayName });
    
    jobLogger.info('Slow worker processing step', { stepType: step.type, displayName });
    
    const stepStart = Date.now();
    
    try {
      const result = await executeStep(step, context);
      const duration = Date.now() - stepStart;
      
      jobLogger.info('Slow step completed', { duration, stepType: step.type, displayName });
      
      return {
        success: true,
        result,
        duration
      };
      
    } catch (error) {
      const duration = Date.now() - stepStart;
      jobLogger.error('Slow step failed', { error: error.message, duration, stepType: step.type, displayName });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  },
  { 
    connection,
    concurrency: 3, // Lower concurrency for slow jobs
    settings: {
      stalledInterval: 5 * 60 * 1000, // 5 minutes
      maxStalledCount: 2
    }
  }
);

slowWorker.on("completed", job => {
  console.log(`Slow job completed: ${job.id}`);
});

slowWorker.on("failed", (job, err) => {
  console.error(`Slow job failed: ${job?.id}`, err.message);
});

console.log('Slow worker started, processing:', SLOW_TOOLS.join(', '));
