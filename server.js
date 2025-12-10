import express from "express";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import { renderTemplate } from "./lib/templating.js";
import { WORKSPACES, PROJECTS, TOOLS, AGENTS, RUNS } from "./lib/store.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const PORT = process.env.PORT || 4000;

function requireApiKey(req, res, next) {
const h = req.headers["authorization"];
if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "missing api key" });
req.apiKey = h.slice(7);
next();
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

app.post("/v1/workspaces", (req, res) => {
const { name, owner_email } = req.body;
if (!name) return res.status(400).json({ error: "missing name" });
const workspace_id = "ws_" + uuidv4();
const api_key = "sk_test_" + uuidv4();
const ws = { workspace_id, name, owner_email, api_key, created_at: new Date().toISOString() };
WORKSPACES.set(workspace_id, ws);
res.json({ workspace_id, api_key });
});

app.post("/v1/projects", requireApiKey, (req, res) => {
const { workspace_id, name } = req.body;
if (!workspace_id || !WORKSPACES.has(workspace_id)) return res.status(400).json({ error: "bad workspace" });
const project_id = "prj_" + uuidv4();
const p = { project_id, workspace_id, name, created_at: new Date().toISOString() };
PROJECTS.set(project_id, p);
res.json(p);
});

app.post("/v1/secrets", requireApiKey, (req, res) => {
const { workspace_id, name, value } = req.body;
if (!workspace_id || !WORKSPACES.has(workspace_id)) return res.status(400).json({ error: "bad workspace" });
const secret_id = "sec_" + uuidv4();
WORKSPACES.get(workspace_id).secrets = WORKSPACES.get(workspace_id).secrets || new Map();
WORKSPACES.get(workspace_id).secrets.set(secret_id, { name, value });
res.json({ secret_id });
});

app.post("/v1/tools", requireApiKey, (req, res) => {
const { project_id, type, name, config } = req.body;
if (!project_id || !PROJECTS.has(project_id)) return res.status(400).json({ error: "bad project" });
const tool_id = "tool_" + uuidv4();
const tool = { tool_id, project_id, type, name, config, created_at: new Date().toISOString() };
TOOLS.set(tool_id, tool);
res.json({ tool_id });
});

app.post("/v1/agents", requireApiKey, (req, res) => {
const { project_id, name, steps, retry_policy = {}, timeout_seconds = 300 } = req.body;
if (!project_id || !PROJECTS.has(project_id)) return res.status(400).json({ error: "bad project" });
if (!Array.isArray(steps)) return res.status(400).json({ error: "steps required" });
const agent_id = "agent_" + uuidv4();
const agent = { agent_id, project_id, name, steps, retry_policy, timeout_seconds, created_at: new Date().toISOString() };
AGENTS.set(agent_id, agent);
res.json({ agent_id });
});

app.get("/v1/agents/:id", requireApiKey, (req, res) => {
const a = AGENTS.get(req.params.id);
if (!a) return res.status(404).json({ error: "not found" });
res.json(a);
});

app.post("/v1/runs", requireApiKey, async (req, res) => {
const { agent_id, project_id, input = {}, run_async = true, webhook } = req.body;
const agent = AGENTS.get(agent_id);
if (!agent) return res.status(404).json({ error: "agent not found" });
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
if (redisData) return res.json(JSON.parse(redisData));

// Fall back to in-memory
const r = RUNS.get(req.params.id);
if (!r) return res.status(404).json({ error: "not found" });
res.json(r);
});

app.get("/health", (req,res)=> res.json({ ok: true }));

app.listen(PORT, () => console.log(`Agent Orchestrator API listening on ${PORT}`));
