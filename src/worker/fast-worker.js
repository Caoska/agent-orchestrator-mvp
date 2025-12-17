import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { executeHttpTool, executeSendGridTool, executeWebhookTool, executeConditionalTool, executeTransformTool, executeDatabaseTool, executeLLMTool, executeTwilioTool } from "../../lib/tools.js";
import { initDb } from "../../lib/db.js";
import * as data from "../../lib/data.js";
import { trackAgentRun, updateQueueDepth } from "../../lib/metrics.js";
import { logger } from "../../lib/logger.js";

dotenv.config();
await initDb();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const FAST_QUEUE_NAME = "fast-jobs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Fast tools that should execute quickly
const FAST_TOOLS = ['http', 'webhook', 'transform', 'conditional', 'sendgrid', 'twilio', 'llm'];

async function executeStep(step, context) {
  const toolMap = {
    http: executeHttpTool,
    webhook: executeWebhookTool,
    conditional: executeConditionalTool,
    transform: executeTransformTool,
    database: executeDatabaseTool,
    sendgrid: executeSendGridTool,
    twilio: executeTwilioTool,
    llm: executeLLMTool
  };
  
  const executor = toolMap[step.type || step.tool];
  if (!executor) {
    throw new Error(`Unknown step type: ${step.type || step.tool}`);
  }
  
  // Check usage limits for email/SMS
  const workspace = context._workspace;
  if (workspace && (step.type === 'sendgrid' || step.type === 'twilio')) {
    const limits = {
      free: { emails: 10, sms: 10 },
      starter: { emails: 100, sms: 50 },
      pro: { emails: 1000, sms: 500 },
      scale: { emails: 10000, sms: 5000 },
      enterprise: { emails: Infinity, sms: Infinity }
    };
    
    const plan = workspace.plan || 'free';
    const limit = limits[plan] || limits.free;
    
    // Only check limits if using PLATFORM credentials (not BYOC)
    const usingPlatformCredentials = step.type === 'sendgrid' 
      ? !step.config.api_key && !workspace.sendgrid_api_key
      : !step.config.account_sid && !workspace.twilio_account_sid;

    if (usingPlatformCredentials) {
      if (step.type === 'sendgrid' && (workspace.emails_this_month || 0) >= limit.emails) {
        throw new Error(`Monthly email limit exceeded (${limit.emails}). Upgrade plan or add your own SendGrid key.`);
      }
      
      if (step.type === 'twilio' && (workspace.sms_this_month || 0) >= limit.sms) {
        throw new Error(`Monthly SMS limit exceeded (${limit.sms}). Upgrade plan or add your own Twilio credentials.`);
      }
    }
    
    // Store BYOC status for usage tracking
    context._usingPlatformCredentials = usingPlatformCredentials;
  }
  
  return await executor(step.config, context);
}

const fastWorker = new Worker(
  FAST_QUEUE_NAME,
  async job => {
    const { step, context, runId, nodeId } = job.data;
    const jobLogger = logger.child({ runId, nodeId, stepType: step.type });
    
    jobLogger.info('Fast worker processing step', { stepType: step.type });
    
    const stepStart = Date.now();
    
    try {
      const result = await executeStep(step, context);
      const duration = Date.now() - stepStart;
      
      jobLogger.info('Fast step completed', { duration, stepType: step.type });
      
      return {
        success: true,
        result,
        duration,
        usingPlatformCredentials: context._usingPlatformCredentials || false
      };
      
    } catch (error) {
      const duration = Date.now() - stepStart;
      jobLogger.error('Fast step failed', { error: error.message, duration, stepType: step.type });
      
      return {
        success: false,
        error: error.message,
        duration
      };
    }
  },
  { 
    connection,
    concurrency: 10, // Higher concurrency for fast jobs
    settings: {
      stalledInterval: 30 * 1000, // 30 seconds
      maxStalledCount: 1
    }
  }
);

fastWorker.on("completed", job => {
  console.log(`Fast job completed: ${job.id}`);
});

fastWorker.on("failed", (job, err) => {
  console.error(`Fast job failed: ${job?.id}`, err.message);
});

console.log('Fast worker started, processing:', FAST_TOOLS.join(', '));
