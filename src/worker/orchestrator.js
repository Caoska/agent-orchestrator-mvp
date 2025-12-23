import { Worker, Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { initDb } from "../../lib/db.js";
import * as data from "../../lib/data.js";
import { trackAgentRun, updateQueueDepth } from "../../lib/metrics.js";
import { logger } from "../../lib/logger.js";

dotenv.config();
await initDb();

const REDIS_URL = process.env.REDIS_URL;
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

// Convert array format to graph format
function normalizeWorkflow(agent) {
  // Expect nodes/connections format
  if (!agent.nodes || !agent.connections) {
    throw new Error('Workflow must have nodes and connections format');
  }
  
  return { nodes: agent.nodes, connections: agent.connections };
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

// Find nodes that are ready to execute (all dependencies completed)
function findReadyNodes(nodes, connections, completedNodes) {
  return nodes.filter(node => {
    if (completedNodes.has(node.id)) return false;
    
    // Find all incoming connections to this node
    const incomingConnections = connections.filter(c => c.to === node.id);
    
    // If no incoming connections, it's a start node
    if (incomingConnections.length === 0) return true;
    
    // Check if all dependencies are completed
    return incomingConnections.every(conn => completedNodes.has(conn.from));
  });
}

// Execute workflow by orchestrating steps across queues
async function executeWorkflow(workflow, initialContext, runId, stepLogs) {
  const { nodes, connections } = normalizeWorkflow(workflow);
  const context = { ...initialContext };
  const nodeOutputs = {};
  const completedNodes = new Set();
  const MAX_ITERATIONS = 1000;
  let iterations = 0;
  
  console.log(`Orchestrating ${nodes.length} nodes with ${connections.length} connections`);
  
  // Handle empty workflow
  if (nodes.length === 0) {
    console.log('Empty workflow, nothing to execute');
    return {};
  }
  
  while (completedNodes.size < nodes.length && iterations < MAX_ITERATIONS) {
    iterations++;
    
    // Find nodes ready to execute
    const readyNodes = findReadyNodes(nodes, connections, completedNodes);
    
    if (readyNodes.length === 0) {
      console.warn('No ready nodes found, possible circular dependency');
      break;
    }
    
    console.log(`Iteration ${iterations}: Executing ${readyNodes.length} nodes in parallel:`, 
      readyNodes.map(n => `${n.id}(${n.type})`));
    
    // Execute ready nodes in parallel
    const nodePromises = readyNodes.map(async (node) => {
      const stepStart = Date.now();
      
      try {
        // Build context with all previous node outputs
        const execContext = { ...context, ...nodeOutputs };
        
        // Route to appropriate worker queue
        const job = await routeStep(node, execContext, runId, node.id);
        
        // Wait for job completion with proper QueueEvents
        const result = await job.waitUntilFinished(
          job.queueName === FAST_QUEUE_NAME ? fastQueueEvents : slowQueueEvents
        );
        
        if (!result.success) {
          throw new Error(result.error);
        }
        
        const duration = Date.now() - stepStart;
        
        return {
          nodeId: node.id,
          node,
          result: result.result,
          duration: result.duration, // Use worker's duration, not orchestrator's
          success: true,
          usingPlatformCredentials: result.usingPlatformCredentials || false
        };
      } catch (stepError) {
        const duration = Date.now() - stepStart;
        
        return {
          nodeId: node.id,
          node,
          error: stepError,
          duration,
          success: false
        };
      }
    });
    
    // Wait for all parallel executions to complete
    const results = await Promise.all(nodePromises);
    
    // Process results
    for (const { nodeId, node, result, error, duration, success, usingPlatformCredentials } of results) {
      if (success) {
        // Store output
        nodeOutputs[nodeId] = result;
        completedNodes.add(nodeId);
        
        stepLogs.push({
          node_id: nodeId,
          type: node.type,
          config: node.config,
          status: "success",
          duration_ms: duration,
          output: result,
          timestamp: new Date().toISOString(),
          usingPlatformCredentials: usingPlatformCredentials || false
        });
        
        console.log(`✓ Node ${nodeId} completed successfully`);
      } else {
        stepLogs.push({
          node_id: nodeId,
          type: node.type,
          config: node.config,
          status: "failed",
          duration_ms: duration,
          error: error.message,
          step_name: node.config?.name || `${node.type} step`,
          timestamp: new Date().toISOString()
        });
        
        console.error(`✗ Node ${nodeId} (${node.config?.name || node.type}) failed:`, error.message);
        throw new Error(`Parallel execution failed at step "${node.config?.name || node.type}" (${nodeId}): ${error.message}`);
      }
    }
  }
  
  if (iterations >= MAX_ITERATIONS) {
    throw new Error('Workflow exceeded maximum iterations (possible infinite loop)');
  }
  
  if (completedNodes.size < nodes.length) {
    const remaining = nodes.filter(n => !completedNodes.has(n.id));
    throw new Error(`Workflow incomplete: ${remaining.length} nodes not executed: ${remaining.map(n => n.id).join(', ')}`);
  }
  
  console.log(`Workflow completed: ${completedNodes.size} nodes executed in ${iterations} iterations`);
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
    
    // Get agent and project from database
    const agent = await data.getAgent(run.agent_id);
    console.log('Retrieved agent nodes:', JSON.stringify(agent?.nodes, null, 2));
    
    if (!agent) {
      // Agent not found - this is an orphaned job, clean it up
      console.log(`Agent ${run.agent_id} not found, cleaning up orphaned repeatable job`);
      
      try {
        // Find and remove the repeatable job that created this run
        const { cleanupOrphanedJobsForAgent } = await import('../../lib/scheduler.js');
        await cleanupOrphanedJobsForAgent(run.agent_id);
      } catch (cleanupError) {
        console.error('Failed to cleanup orphaned job:', cleanupError.message);
      }
      
      throw new Error(`Agent ${run.agent_id} not found`);
    }
    
    const project = await data.getProject(run.project_id);
    if (!project) throw new Error(`Project ${run.project_id} not found`);
    
    console.log('DEBUG: Database lookups:', { 
      agent_id: run.agent_id, 
      agent_found: !!agent,
      project_id: run.project_id, 
      project_found: !!project 
    });
    
    const workspace = await data.getWorkspace(project.workspace_id);
    if (!workspace) throw new Error(`Workspace ${project.workspace_id} not found`);
    
    run.status = "running";
    run.started_at = new Date().toISOString();
    
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
      const project = await data.getProject(run.project_id);
      if (project) {
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
      const project = await data.getProject(run.project_id);
      if (project) {
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
