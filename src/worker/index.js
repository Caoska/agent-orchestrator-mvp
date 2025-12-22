import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { executeHttpTool, executeSendGridTool, executeWebhookTool, executeDelayTool, executeConditionalTool, executeTransformTool, executeDatabaseTool, executeLLMTool, executeTwilioTool } from "../../lib/tools.js";
import { initDb } from "../../lib/db.js";
import * as data from "../../lib/data.js";
import { trackAgentRun, updateQueueDepth } from "../../lib/metrics.js";
import { logger } from "../../lib/logger.js";

dotenv.config();
console.log('Worker env check:', {
  hasPlatformSendGrid: !!process.env.PLATFORM_SENDGRID_API_KEY,
  hasPlatformTwilio: !!process.env.PLATFORM_TWILIO_ACCOUNT_SID,
  hasRedis: !!process.env.REDIS_URL,
  hasDb: !!process.env.DATABASE_URL
});
console.log('All PLATFORM_ vars:', Object.keys(process.env).filter(k => k.startsWith('PLATFORM_')));
await initDb();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function executeStep(step, context) {
  const toolMap = {
    http: executeHttpTool,
    webhook: executeWebhookTool,
    delay: executeDelayTool,
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

// Convert array format to graph format for backward compatibility
function normalizeWorkflow(agent) {
  // If already in graph format (has nodes), return as-is
  if (agent.nodes && agent.connections) {
    return { nodes: agent.nodes, connections: agent.connections };
  }
  
  // Convert array format to graph
  const nodes = agent.steps.map((step, i) => ({
    id: `node_${i}`,
    type: step.tool || step.type,
    config: step.config || step,
    connections: step.connections || []
  }));
  
  // Build connections from array order or explicit connections
  const connections = [];
  nodes.forEach((node, i) => {
    if (node.connections && node.connections.length > 0) {
      // Use explicit connections
      node.connections.forEach(conn => {
        connections.push({
          from: node.id,
          fromPort: conn.port || 'output',
          to: conn.to,
          toPort: 'input'
        });
      });
    } else if (i < nodes.length - 1) {
      // Linear connection to next node
      connections.push({
        from: node.id,
        fromPort: 'output',
        to: `node_${i + 1}`,
        toPort: 'input'
      });
    }
  });
  
  console.log('Normalized workflow:', { 
    nodeCount: nodes.length, 
    connectionCount: connections.length,
    connections: connections.map(c => `${c.from} -> ${c.to}`)
  });
  
  return { nodes, connections };
}

// Execute workflow as a graph
async function executeWorkflow(workflow, initialContext, stepLogs) {
  const { nodes, connections } = normalizeWorkflow(workflow);
  const context = { ...initialContext };
  const nodeOutputs = {};
  const visited = new Set();
  const MAX_ITERATIONS = 1000; // Prevent infinite loops
  let iterations = 0;
  
  // Find starting node (connected from trigger or first node)
  let currentNodeId = nodes[0]?.id;
  
  while (currentNodeId && iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Prevent infinite loops by tracking visits
    const visitKey = `${currentNodeId}_${iterations}`;
    if (visited.has(visitKey)) {
      console.warn(`Loop detected at ${currentNodeId}, breaking`);
      break;
    }
    visited.add(visitKey);
    
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) break;
    
    const stepStart = Date.now();
    console.log(`Executing node ${currentNodeId}: ${node.type}`);
    
    try {
      // Build context with all previous node outputs
      const execContext = { ...context, ...nodeOutputs };
      
      const result = await executeStep(node, execContext);
      const duration = Date.now() - stepStart;
      
      // Store output
      nodeOutputs[currentNodeId] = result;
      
      stepLogs.push({
        node_id: currentNodeId,
        type: node.type,
        config: node.config,
        status: "success",
        duration_ms: duration,
        output: result,
        timestamp: new Date().toISOString(),
        usingPlatformCredentials: context._usingPlatformCredentials || false
      });
      
      // Determine next node based on connections
      let nextNodeId = null;
      
      if (node.type === 'conditional') {
        // Branch based on condition result
        const conditionMet = result.result === true || result === true;
        const port = conditionMet ? 'true' : 'false';
        const connection = connections.find(c => c.from === currentNodeId && c.fromPort === port);
        nextNodeId = connection?.to;
        
        console.log(`Conditional result: ${conditionMet}, next: ${nextNodeId}`);
      } else {
        // Follow normal output connection
        const connection = connections.find(c => c.from === currentNodeId && c.fromPort === 'output');
        nextNodeId = connection?.to;
        console.log(`Looking for connection from ${currentNodeId} with port 'output', found: ${nextNodeId}`);
      }
      
      currentNodeId = nextNodeId;
      
    } catch (stepError) {
      const duration = Date.now() - stepStart;
      
      stepLogs.push({
        node_id: currentNodeId,
        type: node.type,
        config: node.config,
        status: "failed",
        duration_ms: duration,
        error: stepError.message,
        timestamp: new Date().toISOString()
      });
      
      throw stepError;
    }
  }
  
  if (iterations >= MAX_ITERATIONS) {
    throw new Error('Workflow exceeded maximum iterations (possible infinite loop)');
  }
  
  return nodeOutputs;
}

const worker = new Worker(
  QUEUE_NAME,
  async job => {
    const { run_id, agent_id, project_id, input, scheduled } = job.data;
    const jobLogger = logger.child({ runId: run_id, agentId: agent_id });
    
    jobLogger.info('Processing job started', { scheduled });
    
    // Update queue depth metric
    try {
      const queueDepth = await connection.llen(`bull:${QUEUE_NAME}:waiting`);
      updateQueueDepth(QUEUE_NAME, queueDepth);
    } catch (error) {
      jobLogger.warn('Failed to update queue metrics', { error: error.message });
    }
    
    // For scheduled jobs, create a new run
    let actualRunId = run_id;
    if (scheduled) {
      actualRunId = "run_" + (await import("uuid")).v4();
      const run = {
        run_id: actualRunId,
        agent_id,
        project_id,
        input: input || {},
        webhook: null,
        status: "queued",
        created_at: new Date().toISOString()
      };
      await data.createRun(run);
      await connection.set(`run:${actualRunId}`, JSON.stringify(run));
      jobLogger.info('Created scheduled run', { newRunId: actualRunId });
    }
    
    console.log("Worker: processing run", actualRunId, scheduled ? "(scheduled)" : "");
    
    // Fetch from Redis
    const runData = await connection.get(`run:${actualRunId}`);
    if (!runData) throw new Error(`Run ${actualRunId} not found`);
    const run = JSON.parse(runData);
    
    const agentData = await connection.get(`agent:${run.agent_id}`);
    if (!agentData) throw new Error(`Agent ${run.agent_id} not found`);
    const agent = JSON.parse(agentData);
    
    run.status = "running";
    run.started_at = new Date().toISOString();
    
    // Get workspace for API keys from database
    const project = await data.getProject(run.project_id);
    const workspace = project ? await data.getWorkspace(project.workspace_id) : null;
    
    const context = { input: run.input, _workspace: workspace };
    const stepLogs = [];
    const runStart = Date.now();
    
    try {
      // Execute workflow as graph
      await executeWorkflow(agent, context, stepLogs);
      
      const executionSeconds = Math.ceil((Date.now() - runStart) / 1000);
      
      // Count usage
      const httpCalls = stepLogs.filter(s => s.type === 'http').length;
      const webhooks = stepLogs.filter(s => s.type === 'webhook').length;
      
      // Count platform email/SMS usage (not BYOC)
      const platformEmails = stepLogs.filter(s => 
        s.type === 'sendgrid' && s.usingPlatformCredentials
      ).length;
      const platformSMS = stepLogs.filter(s => 
        s.type === 'twilio' && s.usingPlatformCredentials
      ).length;
      
      run.status = "completed";
      run.completed_at = new Date().toISOString();
      run.results = { steps: stepLogs };
      
      // Update workspace usage metrics
      const projectData = await connection.get(`project:${run.project_id}`);
      if (projectData) {
        const project = JSON.parse(projectData);
        await data.incrementUsage(project.workspace_id, {
          steps: stepLogs.length,
          http_calls: httpCalls,
          webhooks: webhooks,
          execution_seconds: executionSeconds,
          platform_emails: platformEmails,
          platform_sms: platformSMS
        });
        
        // Check usage thresholds after incrementing
        const { checkUsageThresholds } = await import('../../lib/usage-notifications.js');
        await checkUsageThresholds(project.workspace_id);
      }
      
      // Track metrics
      trackAgentRun("completed", project.workspace_id, executionSeconds);
      
      // Save to both Redis and DB
      await connection.set(`run:${actualRunId}`, JSON.stringify(run));
      await data.updateRun(actualRunId, {
        status: "completed",
        completed_at: run.completed_at,
        results: run.results
      });
      
    } catch (error) {
      run.status = "failed";
      run.error = error.message;
      run.completed_at = new Date().toISOString();
      run.results = { steps: stepLogs };
      
      // Track failed run metrics
      const executionSeconds = Math.ceil((Date.now() - runStart) / 1000);
      const projectData = await connection.get(`project:${run.project_id}`);
      if (projectData) {
        const project = JSON.parse(projectData);
        trackAgentRun("failed", project.workspace_id, executionSeconds);
      }
      
      await connection.set(`run:${actualRunId}`, JSON.stringify(run));
      await data.updateRun(actualRunId, {
        status: "failed",
        error: error.message,
        completed_at: run.completed_at,
        results: run.results
      });
      
      console.error("Run failed:", error);
    }
    
    return { ok: true, run_id: actualRunId, status: run.status };
  },
  { connection }
);

worker.on("completed", job => {
  console.log("Job completed", job.id);
});

worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});
