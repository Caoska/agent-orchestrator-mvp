import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { executeHttpTool, executeSmtpTool } from "./lib/tools.js";
import { RUNS, AGENTS, TOOLS } from "./lib/store.js";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// In-memory stores (shared with server for MVP)

async function executeStep(step, context, tools) {
  if (step.type === "http") {
    return await executeHttpTool(step.config, context);
  }
  
  if (step.type === "smtp") {
    return await executeSmtpTool(step.config, context);
  }
  
  if (step.type === "tool") {
    const tool = tools.get(step.tool_id);
    if (!tool) throw new Error(`Tool ${step.tool_id} not found`);
    
    if (tool.type === "http") {
      return await executeHttpTool(tool.config, context);
    }
    if (tool.type === "smtp") {
      return await executeSmtpTool(tool.config, context);
    }
  }
  
  throw new Error(`Unknown step type: ${step.type}`);
}

const worker = new Worker(
  QUEUE_NAME,
  async job => {
    const { run_id } = job.data;
    console.log("Worker: processing run", run_id);
    
    // Fetch from Redis
    const runData = await connection.get(`run:${run_id}`);
    if (!runData) throw new Error(`Run ${run_id} not found`);
    const run = JSON.parse(runData);
    
    const agentData = await connection.get(`agent:${run.agent_id}`);
    if (!agentData) throw new Error(`Agent ${run.agent_id} not found`);
    const agent = JSON.parse(agentData);
    
    run.status = "running";
    run.started_at = new Date().toISOString();
    
    const context = { ...run.input };
    const results = [];
    
    try {
      for (const step of agent.steps) {
        console.log(`Executing step: ${step.name || step.type}`);
        const result = await executeStep(step, context, TOOLS);
        results.push({ step: step.name || step.type, result });
        
        // Update context with result
        if (step.output_key) {
          context[step.output_key] = result;
        }
      }
      
      run.status = "completed";
      run.completed_at = new Date().toISOString();
      run.results = results;
      
      // Save back to Redis
      await connection.set(`run:${run_id}`, JSON.stringify(run));
      
    } catch (error) {
      run.status = "failed";
      run.error = error.message;
      run.completed_at = new Date().toISOString();
      await connection.set(`run:${run_id}`, JSON.stringify(run));
      console.error("Run failed:", error);
    }
    
    return { ok: true, run_id, status: run.status };
  },
  { connection }
);

worker.on("completed", job => {
  console.log("Job completed", job.id);
});

worker.on("failed", (job, err) => {
  console.error("Job failed", job?.id, err);
});
