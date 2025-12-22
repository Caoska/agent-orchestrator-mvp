import { Worker, Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { initDb } from "../../lib/db.js";
import * as data from "../../lib/data.js";
import { trackAgentRun, updateQueueDepth } from "../../lib/metrics.js";
import { logger } from "../../lib/logger.js";

dotenv.config();
await initDb();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const ORCHESTRATOR_QUEUE_NAME = "runs";
const FAST_QUEUE_NAME = "fast-jobs";
const SLOW_QUEUE_NAME = "slow-jobs";

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// Create queues and queue events for routing jobs
const fastQueue = new Queue(FAST_QUEUE_NAME, { connection });
const slowQueue = new Queue(SLOW_QUEUE_NAME, { connection });
const fastQueueEvents = new QueueEvents(FAST_QUEUE_NAME, { connection });
const slowQueueEvents = new QueueEvents(SLOW_QUEUE_NAME, { connection });

// Tool classification
const FAST_TOOLS = ['http', 'webhook', 'transform', 'conditional', 'sendgrid', 'twilio', 'llm'];
const SLOW_TOOLS = ['delay', 'database-poll'];

// Convert array format to graph format for backward compatibility
function normalizeWorkflow(agent) {
  if (agent.nodes && agent.connections) {
    return { nodes: agent.nodes, connections: agent.connections };
  }
  
  console.log('Raw agent steps:', agent.steps?.map((s, i) => ({ index: i, type: s.tool || s.type })));
  
  const nodes = agent.steps.map((step, i) => ({
    id: `node_${i}`,
    type: step.tool || step.type,
    config: step.config || step,
    connections: step.connections || []
  }));
  
  console.log('Generated nodes:', nodes.map(n => ({ id: n.id, type: n.type })));
  
  const connections = [];
  console.log('FIXED VERSION: Starting connection creation...');
  nodes.forEach((node, i) => {
    console.log(`Processing node ${i}: ${node.id} (${node.type})`);
    if (node.connections && node.connections.length > 0) {
      console.log(`Node ${node.id} has explicit connections:`, node.connections);
      node.connections.forEach(conn => {
        connections.push({
          from: node.id,
          fromPort: conn.port || 'output',
          to: conn.to,
          toPort: 'input'
        });
      });
    } else if (i < nodes.length - 1) {
      // Use the actual next node's ID instead of generating it
      const nextNode = nodes[i + 1];
      const nextNodeId = nextNode.id;
      console.log(`FIXED: Creating connection ${node.id} -> ${nextNodeId} (was broken before)`);
      connections.push({
        from: node.id,
        fromPort: 'output',
        to: nextNodeId,
        toPort: 'input'
      });
    } else {
      console.log(`Node ${node.id} is the last node, no connection needed`);
    }
  });
  
  console.log('Connections after creation:', connections.map(c => `${c.from} -> ${c.to}`));
  
  console.log('Orchestrator normalized workflow:', { 
    nodeCount: nodes.length, 
    connectionCount: connections.length,
    connections: connections.map(c => `${c.from} -> ${c.to}`)
  });
  
  return { nodes, connections };
}

// Route step to appropriate queue
function routeStep(step, context, runId, nodeId) {
  const stepType = step.type || step.tool;
  
  if (FAST_TOOLS.includes(stepType)) {
    return fastQueue.add('execute-step', {
      step,
      context,
      runId,
      nodeId
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
  } else if (SLOW_TOOLS.includes(stepType) || stepType === 'delay') {
    return slowQueue.add('execute-step', {
      step,
      context,
      runId,
      nodeId
    }, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });
  } else {
    // Default to fast queue for unknown tools
    return fastQueue.add('execute-step', {
      step,
      context,
      runId,
      nodeId
    });
  }
}

// Execute workflow by orchestrating steps across queues
async function executeWorkflow(workflow, initialContext, runId, stepLogs) {
  const { nodes, connections } = normalizeWorkflow(workflow);
  const context = { ...initialContext };
  const nodeOutputs = {};
  const visited = new Set();
  const MAX_ITERATIONS = 1000;
  let iterations = 0;
  
  let currentNodeId = nodes[0]?.id;
  
  while (currentNodeId && iterations < MAX_ITERATIONS) {
    iterations++;
    
    const visitKey = `${currentNodeId}_${iterations}`;
    if (visited.has(visitKey)) {
      console.warn(`Loop detected at ${currentNodeId}, breaking`);
      break;
    }
    visited.add(visitKey);
    
    const node = nodes.find(n => n.id === currentNodeId);
    if (!node) break;
    
    console.log(`Orchestrating node ${currentNodeId}: ${node.type}`);
    
    try {
      // Build context with all previous node outputs
      const execContext = { ...context, ...nodeOutputs };
      
      // Route to appropriate worker queue
      const job = await routeStep(node, execContext, runId, currentNodeId);
      
      // Wait for job completion with proper QueueEvents
      const result = await job.waitUntilFinished(
        job.queueName === FAST_QUEUE_NAME ? fastQueueEvents : slowQueueEvents
      );
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Store output
      nodeOutputs[currentNodeId] = result.result;
      
      stepLogs.push({
        node_id: currentNodeId,
        type: node.type,
        config: node.config,
        status: "success",
        duration_ms: result.duration,
        output: result.result,
        timestamp: new Date().toISOString(),
        usingPlatformCredentials: result.usingPlatformCredentials || false
      });
      
      // Determine next node
      let nextNodeId = null;
      
      if (node.type === 'conditional') {
        const conditionMet = result.result.result === true || result.result === true;
        const port = conditionMet ? 'true' : 'false';
        const connection = connections.find(c => c.from === currentNodeId && c.fromPort === port);
        nextNodeId = connection?.to;
        
        console.log(`Conditional result: ${conditionMet}, next: ${nextNodeId}`);
      } else {
        const connection = connections.find(c => c.from === currentNodeId && c.fromPort === 'output');
        nextNodeId = connection?.to;
        console.log(`Orchestrator: Looking for connection from ${currentNodeId} with port 'output', found: ${nextNodeId}`);
      }
      
      currentNodeId = nextNodeId;
      
    } catch (stepError) {
      stepLogs.push({
        node_id: currentNodeId,
        type: node.type,
        config: node.config,
        status: "failed",
        duration_ms: 0,
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

const orchestrator = new Worker(
  ORCHESTRATOR_QUEUE_NAME,
  async job => {
    const { run_id, agent_id, project_id, input, scheduled } = job.data;
    const jobLogger = logger.child({ runId: run_id, agentId: agent_id });
    
    jobLogger.info('Orchestrator processing workflow', { scheduled });
    
    // Update queue depth metric
    try {
      const queueDepth = await connection.llen(`bull:${ORCHESTRATOR_QUEUE_NAME}:waiting`);
      updateQueueDepth(ORCHESTRATOR_QUEUE_NAME, queueDepth);
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
    
    console.log("Orchestrator: processing run", actualRunId, scheduled ? "(scheduled)" : "");
    
    // Fetch from Redis
    const runData = await connection.get(`run:${actualRunId}`);
    if (!runData) throw new Error(`Run ${actualRunId} not found`);
    const run = JSON.parse(runData);
    
    const agentData = await connection.get(`agent:${run.agent_id}`);
    if (!agentData) throw new Error(`Agent ${run.agent_id} not found`);
    const agent = JSON.parse(agentData);
    
    run.status = "running";
    run.started_at = new Date().toISOString();
    
    // Get workspace for API keys from Redis/database
    const projectData = await connection.get(`project:${run.project_id}`);
    const project = projectData ? JSON.parse(projectData) : await data.getProject(run.project_id);
    console.log('DEBUG: getProject result:', { project_id: run.project_id, project: project ? 'FOUND' : 'NULL', source: projectData ? 'REDIS' : 'DB' });
    const workspace = project ? await data.getWorkspace(project.workspace_id) : null;
    
    const context = { input: run.input, _workspace: workspace };
    const stepLogs = [];
    const runStart = Date.now();
    
    try {
      // Execute workflow through orchestration
      await executeWorkflow(agent, context, actualRunId, stepLogs);
      
      const executionSeconds = Math.ceil((Date.now() - runStart) / 1000);
      
      // Count usage
      const httpCalls = stepLogs.filter(s => s.type === 'http').length;
      const webhooks = stepLogs.filter(s => s.type === 'webhook').length;
      
      // Debug: log usage tracking
      console.log('Usage tracking:', {
        steps: stepLogs.length,
        httpCalls,
        webhooks,
        executionSeconds,
        stepTypes: stepLogs.map(s => s.type)
      });
      
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
  { 
    connection,
    concurrency: 5 // Moderate concurrency for orchestration
  }
);

orchestrator.on("completed", job => {
  console.log("Orchestrator job completed", job.id);
});

orchestrator.on("failed", (job, err) => {
  console.error("Orchestrator job failed", job?.id, err);
});

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down orchestrator...');
  await orchestrator.close();
  await fastQueue.close();
  await slowQueue.close();
  await fastQueueEvents.close();
  await slowQueueEvents.close();
  await connection.quit();
});

console.log('Orchestrator started - routing to fast/slow workers');
