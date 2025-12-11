import express from "express";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { initDb, getDb } from "./lib/db.js";
import * as data from "./lib/data.js";
import { scheduleRun, removeSchedule, listSchedules } from "./lib/scheduler.js";
import { canExecuteRun, createCheckoutSession, createPortalSession } from "./lib/stripe.js";
import { TEMPLATES, getTemplate } from "./lib/templates.js";
import { generateWebhookSecret } from "./lib/webhooks.js";
import { rateLimit } from "./lib/ratelimit.js";

dotenv.config();

// Initialize DB but don't block server startup if it fails
initDb().catch(err => {
  console.error('Database initialization failed:', err.message);
  console.log('Server will continue without database');
});

const app = express();

// Stripe webhook needs raw body
app.post("/v1/webhooks/stripe", express.raw({ type: 'application/json' }), async (req, res) => {
  const { stripe } = await import('./lib/stripe.js');
  const sig = req.headers['stripe-signature'];
  
  console.log('Webhook received:', {
    hasSignature: !!sig,
    hasBody: !!req.body,
    bodyType: typeof req.body,
    isBuffer: Buffer.isBuffer(req.body),
    hasSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    secretPrefix: process.env.STRIPE_WEBHOOK_SECRET?.substring(0, 6)
  });
  
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      await data.updateWorkspace(session.metadata.workspace_id, {
        plan: session.metadata.plan,
        stripe_customer_id: session.customer,
        stripe_subscription_id: session.subscription
      });
    }
    
    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      const workspace = await data.getWorkspaceByStripeCustomer(subscription.customer);
      if (workspace) {
        await data.updateWorkspace(workspace.workspace_id, { plan: 'free' });
      }
    }
    
    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

app.use(bodyParser.json());
app.use(express.static('public'));

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";

function requireApiKey(req, res, next) {
  const h = req.headers["authorization"];
  if (!h || !h.startsWith("Bearer ")) return res.status(401).json({ error: "missing api key" });
  
  const apiKey = h.slice(7);
  req.apiKey = apiKey;
  next();
}

async function requireWorkspace(req, res, next) {
  const workspace = await data.getWorkspaceByApiKey(req.apiKey);
  if (!workspace) return res.status(401).json({ error: "invalid api key" });
  req.workspace = workspace;
  next();
}

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

// Auth endpoints
app.post("/v1/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: "missing fields" });
  
  // Check if email exists
  const existing = await data.getWorkspaceByEmail(email);
  if (existing) return res.status(400).json({ error: "email already exists" });
  
  const workspace_id = "ws_" + uuidv4();
  const api_key = "sk_test_" + uuidv4();
  const password_hash = await bcrypt.hash(password, 10);
  
  const ws = { 
    workspace_id, 
    name, 
    owner_email: email, 
    api_key, 
    password_hash,
    plan: 'free', 
    runs_this_month: 0, 
    created_at: new Date().toISOString() 
  };
  
  await data.createWorkspace(ws);
  
  // Create default project
  const project_id = "prj_" + uuidv4();
  const project = { project_id, workspace_id, name: "Default Project", created_at: new Date().toISOString() };
  await data.createProject(project);
  
  const token = jwt.sign({ workspace_id, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, workspace_id, api_key });
});

app.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "missing fields" });
  
  const workspace = await data.getWorkspaceByEmail(email);
  if (!workspace) return res.status(401).json({ error: "invalid credentials" });
  
  const valid = await bcrypt.compare(password, workspace.password_hash);
  if (!valid) return res.status(401).json({ error: "invalid credentials" });
  
  const token = jwt.sign({ workspace_id: workspace.workspace_id, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, workspace_id: workspace.workspace_id, api_key: workspace.api_key });
});

app.post("/v1/workspaces", async (req, res) => {
  const { name, owner_email } = req.body;
  if (!name) return res.status(400).json({ error: "missing name" });
  
  const workspace_id = "ws_" + uuidv4();
  const api_key = "sk_test_" + uuidv4();
  const ws = { workspace_id, name, owner_email, api_key, plan: 'free', runs_this_month: 0, created_at: new Date().toISOString() };
  
  await data.createWorkspace(ws);
  
  // Create default project
  const project_id = "prj_" + uuidv4();
  const project = { project_id, workspace_id, name: "Default Project", created_at: new Date().toISOString() };
  await data.createProject(project);
  
  res.json({ workspace_id, api_key });
});

app.post("/v1/projects", requireApiKey, requireWorkspace, async (req, res) => {
  const { workspace_id, name } = req.body;
  
  if (workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "workspace access denied" });
  }
  
  const project_id = "prj_" + uuidv4();
  const p = { project_id, workspace_id, name, created_at: new Date().toISOString() };
  
  await data.createProject(p);
  res.json(p);
});

app.get("/v1/projects", requireApiKey, requireWorkspace, async (req, res) => {
  const projects = await data.listProjects(req.workspace.workspace_id);
  res.json(projects);
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

app.post("/v1/agents", requireApiKey, requireWorkspace, async (req, res) => {
  const { project_id, name, steps, retry_policy = {}, timeout_seconds = 300 } = req.body;
  const project = await data.getProject(project_id);
  
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "project access denied" });
  }
  
  if (!Array.isArray(steps)) return res.status(400).json({ error: "steps required" });
  
  const agent_id = "agent_" + uuidv4();
  const webhook_secret = generateWebhookSecret();
  const agent = { agent_id, project_id, name, steps, retry_policy, timeout_seconds, webhook_secret, created_at: new Date().toISOString() };
  await data.createAgent(agent);
  res.json({ agent_id, webhook_secret });
});

app.get("/v1/agents", requireApiKey, requireWorkspace, async (req, res) => {
  const agents = await data.listAgents(req.workspace.workspace_id);
  res.json(agents);
});

app.delete("/v1/agents/:id", requireApiKey, requireWorkspace, async (req, res) => {
  const agent = await data.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "not found" });
  
  const project = await data.getProject(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  await data.deleteAgent(req.params.id);
  res.json({ ok: true });
});

app.get("/v1/agents/:id", requireApiKey, requireWorkspace, async (req, res) => {
  const agent = await data.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "not found" });
  
  const project = await data.getProject(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  res.json(agent);
});

app.put("/v1/agents/:id", requireApiKey, requireWorkspace, async (req, res) => {
  const { name, steps, retry_policy, timeout_seconds } = req.body;
  const agent = await data.getAgent(req.params.id);
  if (!agent) return res.status(404).json({ error: "not found" });
  
  const project = await data.getProject(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  await data.updateAgent(req.params.id, { name, steps, retry_policy, timeout_seconds });
  res.json({ updated: true });
});

app.post("/v1/runs", requireApiKey, requireWorkspace, rateLimit(60000, 100), async (req, res) => {
  const { agent_id, project_id, input = {}, run_async = true, webhook } = req.body;
  const agent = await data.getAgent(agent_id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  
  const project = await data.getProject(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  // Check usage limits
  if (!canExecuteRun(req.workspace)) {
    return res.status(402).json({ error: "run limit reached", upgrade_url: "/upgrade" });
  }
  
  const run_id = "run_" + uuidv4();
  const run = {
    run_id, agent_id, project_id, input, webhook: webhook || null,
    status: "queued", created_at: new Date().toISOString()
  };
  
  await data.createRun(run);
  
  // Increment monthly run counter
  await data.updateWorkspace(req.workspace.workspace_id, {
    runs_this_month: (req.workspace.runs_this_month || 0) + 1
  });

  // Store in Redis for worker access
  await connection.set(`run:${run_id}`, JSON.stringify(run));
  await connection.set(`agent:${agent_id}`, JSON.stringify(agent));

  await runQueue.add("run", { run_id }, { removeOnComplete: true, removeOnFail: false });
  res.json({ run_id, status: "queued" });
});

app.get("/v1/runs", requireApiKey, requireWorkspace, async (req, res) => {
  const runs = await data.listRuns(req.workspace.workspace_id);
  res.json(runs);
});

app.get("/v1/runs/:id", requireApiKey, requireWorkspace, async (req, res) => {
  // Try Redis first (for completed runs), then DB
  const redisData = await connection.get(`run:${req.params.id}`);
  const run = redisData ? JSON.parse(redisData) : await data.getRun(req.params.id);
  
  if (!run) return res.status(404).json({ error: "not found" });
  
  // Verify access
  const agent = await data.getAgent(run.agent_id);
  if (agent) {
    const project = await data.getProject(agent.project_id);
    if (!project || project.workspace_id !== req.workspace.workspace_id) {
      return res.status(403).json({ error: "access denied" });
    }
  }
  
  res.json(run);
});

// Schedules
app.post("/v1/schedules", requireApiKey, requireWorkspace, async (req, res) => {
  const { agent_id, project_id, input = {}, cron, interval_seconds } = req.body;
  
  if (!cron && !interval_seconds) {
    return res.status(400).json({ error: "Either cron or interval_seconds required" });
  }
  
  const agent = await data.getAgent(agent_id);
  if (!agent) return res.status(404).json({ error: "agent not found" });
  
  const project = await data.getProject(agent.project_id);
  if (!project || project.workspace_id !== req.workspace.workspace_id) {
    return res.status(403).json({ error: "access denied" });
  }
  
  const schedule_id = "sched_" + uuidv4();
  const schedule = {
    schedule_id,
    agent_id,
    project_id,
    input,
    cron: cron || null,
    interval_seconds: interval_seconds || null,
    enabled: true,
    created_at: new Date().toISOString()
  };
  
  const db = getDb();
  if (db) {
    await db.query(
      'INSERT INTO schedules (schedule_id, agent_id, project_id, input, cron, interval_seconds, enabled) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [schedule_id, agent_id, project_id, JSON.stringify(input), cron, interval_seconds, true]
    );
  }
  
  await scheduleRun(schedule);
  
  res.json({ schedule_id, cron, interval_seconds });
});

app.delete("/v1/schedules/:id", requireApiKey, requireWorkspace, async (req, res) => {
  await removeSchedule(req.params.id);
  
  const db = getDb();
  if (db) {
    await db.query('DELETE FROM schedules WHERE schedule_id = $1', [req.params.id]);
  }
  
  res.json({ deleted: true });
});

app.get("/v1/schedules", requireApiKey, requireWorkspace, async (req, res) => {
  const schedules = await listSchedules();
  res.json({ schedules });
});

app.get("/v1/workspace", requireApiKey, requireWorkspace, async (req, res) => {
  res.json(req.workspace);
});

app.patch("/v1/workspace/settings", requireApiKey, requireWorkspace, async (req, res) => {
  const { openai_api_key } = req.body;
  
  await data.updateWorkspace(req.workspace.workspace_id, { openai_api_key });
  res.json({ updated: true });
});

app.get("/v1/templates", (req, res) => {
  res.json(TEMPLATES);
});

app.get("/v1/templates/:id", (req, res) => {
  const template = getTemplate(req.params.id);
  if (!template) return res.status(404).json({ error: "template not found" });
  res.json(template);
});

// Stripe endpoints
app.post("/v1/checkout", requireApiKey, requireWorkspace, async (req, res) => {
  const { plan } = req.body;
  const { PLANS } = await import('./lib/stripe.js');
  
  if (!PLANS[plan]) return res.status(400).json({ error: "invalid plan" });
  
  try {
    const session = await createCheckoutSession(
      req.workspace.workspace_id,
      plan,
      `${req.headers.origin || 'http://localhost:8080'}?checkout=success`,
      `${req.headers.origin || 'http://localhost:8080'}?checkout=cancel`
    );
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/v1/billing-portal", requireApiKey, requireWorkspace, async (req, res) => {
  if (!req.workspace.stripe_customer_id) {
    return res.status(400).json({ error: "no subscription" });
  }
  
  try {
    const session = await createPortalSession(
      req.workspace.stripe_customer_id,
      req.headers.origin || 'http://localhost:8080'
    );
    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/health", (req,res)=> res.json({ ok: true }));

app.listen(PORT, () => console.log(`Agent Orchestrator API listening on ${PORT}`));
