import express from "express";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { renderTemplate } from "./lib/templating.js";
import { WORKSPACES, PROJECTS, TOOLS, AGENTS, RUNS } from "./lib/store.js";
import { getDb, initDb } from "./lib/db.js";

dotenv.config();

await initDb();

const app = express();
app.use(bodyParser.json());

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const PORT = process.env.PORT || 4000;
const db = getDb();

function requireApiKey(req, res, next) {
  const h = req.headers["authorization"];
  if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "missing api key" });
  
  const apiKey = h.slice(7);
  req.apiKey = apiKey;
  next();
}

async function getWorkspaceByApiKey(apiKey) {
  if (db) {
    const result = await db.query('SELECT * FROM workspaces WHERE api_key = $1', [apiKey]);
    return result.rows[0] || null;
  }
  
  for (const ws of WORKSPACES.values()) {
    if (ws.api_key === apiKey) return ws;
  }
  return null;
}

async function requireWorkspace(req, res, next) {
  const workspace = await getWorkspaceByApiKey(req.apiKey);
  if (!workspace) return res.status(401).json({ error: "invalid api key" });
  req.workspace = workspace;
  next();
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

app.post("/v1/workspaces", async (req, res) => {
  const { name, owner_email } = req.body;
  if (!name) return res.status(400).json({ error: "missing name" });
  
  const workspace_id = "ws_" + uuidv4();
  const api_key = "sk_test_" + uuidv4();
  const ws = { workspace_id, name, owner_email, api_key, created_at: new Date().toISOString() };
  
  if (db) {
    await db.query(
      'INSERT INTO workspaces (workspace_id, name, owner_email, api_key) VALUES ($1, $2, $3, $4)',
      [workspace_id, name, owner_email, api_key]
    );
  } else {
    WORKSPACES.set(workspace_id, ws);
  }
  
  res.json({ workspace_id, api_key });
});

app.post("/v1/projects", requireApiKey, requireWorkspace, async (req, res) => {
  const { workspace_id, name } = req.body;
  
  if (workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "workspace access denied" });
  }
  
  const project_id = "prj_" + uuidv4();
  const p = { project_id, workspace_id, name, created_at: new Date().toISOString() };
  
  if (db) {
    await db.query(
      'INSERT INTO projects (project_id, workspace_id, name) VALUES ($1, $2, $3)',
      [project_id, workspace_id, name]
    );
  } else {
    PROJECTS.set(project_id, p);
  }
  
  res.json(p);
});

app.post("/v1/secrets", requireApiKey, (req, res) => {
  const { workspace_id, name, value } = req.body;
  
  // Validate workspace belongs to API key
  if (workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "workspace access denied" });
  }
  
  const secret_id = "sec_" + uuidv4();
  WORKSPACES.get(workspace_id).secrets = WORKSPACES.get(workspace_id).secrets || new Map();
  WORKSPACES.get(workspace_id).secrets.set(secret_id, { name, value });
  res.json({ secret_id });
});

app.post("/v1/tools", requireApiKey, (req, res) => {
  const { project_id, type, name, config } = req.body;
  const project = PROJECTS.get(project_id);
  
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "project access denied" });
  }
  
  const tool_id = "tool_" + uuidv4();
  const tool = { tool_id, project_id, type, name, config, created_at: new Date().toISOString() };
  TOOLS.set(tool_id, tool);
  res.json({ tool_id });
});

app.post("/v1/agents", requireApiKey, (req, res) => {
  const { project_id, name, steps, retry_policy = {}, timeout_seconds = 300 } = req.body;
  const project = PROJECTS.get(project_id);
  
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "project access denied" });
  }
  
  if (!Array.isArray(steps)) return res.status(400).json({ error: "steps required" });
  
  const agent_id = "agent_" + uuidv4();
  const agent = { agent_id, project_id, name, steps, retry_policy, timeout_seconds, created_at: new Date().toISOString() };
  AGENTS.set(agent_id, agent);
  res.json({ agent_id });
});

app.get("/v1/agents/:id", requireApiKey, (req, res) => {
  const agent = AGENTS.get(req.params.id);
  if (!agent) return res.status(404).json({ error: "not found" });
  
  const project = PROJECTS.get(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  res.json(agent);
});

app.post("/v1/runs", requireApiKey, async (req, res) => {
  const { agent_id, project_id, input = {}, run_async = true, webhook } = req.body;
  const agent = AGENTS.get(agent_id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  
  const project = PROJECTS.get(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  const run_id = "run_" + uuidv4();
  const run = {
    run_id, agent_id, project_id, input, webhook: webhook || null,
    status: "queued", created_at: new Date().toISOString(), steps: [], logs: []
  };
  RUNS.set(run_id, run);

  // Store in Redis for worker access
  await connection.set(`run:${run_id}`, JSON.stringify(run));
  await connection.set(`agent:${agent_id}`, JSON.stringify(agent));

  await runQueue.add("run", { run_id }, { removeOnComplete: true, removeOnFail: false });
  res.json({ run_id, status: "queued" });
});

app.get("/v1/runs/:id", requireApiKey, async (req, res) => {
  // Try Redis first (for completed runs)
  const redisData = await connection.get(`run:${req.params.id}`);
  const run = redisData ? JSON.parse(redisData) : RUNS.get(req.params.id);
  
  if (!run) return res.status(404).json({ error: "not found" });
  
  // Verify access
  const agent = AGENTS.get(run.agent_id);
  if (agent) {
    const project = PROJECTS.get(agent.project_id);
    if (!project || project.workspace_id !== req.workspace.workspace_id) {
      return res.status(403).json({ error: "access denied" });
    }
  }
  
  res.json(run);
});

app.get("/health", (req,res)=> res.json({ ok: true }));

app.listen(PORT, () => console.log(`Agent Orchestrator API listening on ${PORT}`));
