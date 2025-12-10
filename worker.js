import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { executeHttpTool, executeSmtpTool, executeWebhookTool, executeDelayTool, executeConditionalTool, executeTransformTool, executeDatabaseTool, executeLLMTool } from "./lib/tools.js";
import { initDb } from "./lib/db.js";
import * as data from "./lib/data.js";

dotenv.config();
await initDb();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// In-memory stores (shared with server for MVP)

async function executeStep(step, context) {
  if (step.type === "http") {
    return await executeHttpTool(step.config, context);
  }
  
  if (step.type === "webhook") {
    return await executeWebhookTool(step.config, context);
  }
  
  if (step.type === "delay") {
    return await executeDelayTool(step.config, context);
  }
  
  if (step.type === "conditional") {
    return await executeConditionalTool(step.config, context);
  }
  
  if (step.type === "transform") {
    return await executeTransformTool(step.config, context);
  }
  
  if (step.type === "database") {
    return await executeDatabaseTool(step.config, context);
  }
  
  if (step.type === "smtp") {
    return await executeSmtpTool(step.config, context);
  }
  
  if (step.type === "llm") {
    return await executeLLMTool(step.config, context);
  }
  
  if (step.type === "tool") {
    // Tool references not implemented yet
    throw new Error(`Tool references not yet supported`);
  }
  
  throw new Error(`Unknown step type: ${step.type}`);
}

const worker = new Worker(
  QUEUE_NAME,
  async job => {
    const { run_id, agent_id, project_id, input, scheduled } = job.data;
    
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
    
    const context = { ...run.input };
    const stepLogs = [];
    let httpCalls = 0;
    let webhooks = 0;
    const runStart = Date.now();
    
    try {
      for (let i = 0; i < agent.steps.length; i++) {
        const step = agent.steps[i];
        const stepStart = Date.now();
        
        console.log(`Executing step ${i}: ${step.type}`);
        
        // Track usage
        if (step.type === 'http') httpCalls++;
        if (step.type === 'webhook') webhooks++;
        
        try {
          const result = await executeStep(step, context);
          const duration = Date.now() - stepStart;
          
          stepLogs.push({
            step: i,
            type: step.type,
            status: "success",
            duration_ms: duration,
            output: result,
            timestamp: new Date().toISOString()
          });
          
          // Update context with result
          if (step.output_key) {
            context[step.output_key] = result;
          }
        } catch (stepError) {
          const duration = Date.now() - stepStart;
          
          stepLogs.push({
            step: i,
            type: step.type,
            status: "failed",
            duration_ms: duration,
            error: stepError.message,
            timestamp: new Date().toISOString()
          });
          
          throw stepError;
        }
      }
      
      const executionSeconds = Math.ceil((Date.now() - runStart) / 1000);
      
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
          execution_seconds: executionSeconds
        });
      }
      
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
