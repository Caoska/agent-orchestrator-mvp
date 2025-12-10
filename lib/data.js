import { getDb } from "./db.js";
import { WORKSPACES, PROJECTS, TOOLS, AGENTS, RUNS } from "./store.js";

const db = getDb();

// Workspaces
export async function createWorkspace(workspace) {
  if (db) {
    await db.query(
      'INSERT INTO workspaces (workspace_id, name, owner_email, api_key, created_at) VALUES ($1, $2, $3, $4, $5)',
      [workspace.workspace_id, workspace.name, workspace.owner_email, workspace.api_key, workspace.created_at]
    );
  } else {
    WORKSPACES.set(workspace.workspace_id, workspace);
  }
}

export async function getWorkspaceByApiKey(apiKey) {
  if (db) {
    const result = await db.query('SELECT * FROM workspaces WHERE api_key = $1', [apiKey]);
    return result.rows[0] || null;
  }
  for (const ws of WORKSPACES.values()) {
    if (ws.api_key === apiKey) return ws;
  }
  return null;
}

// Projects
export async function createProject(project) {
  if (db) {
    await db.query(
      'INSERT INTO projects (project_id, workspace_id, name, created_at) VALUES ($1, $2, $3, $4)',
      [project.project_id, project.workspace_id, project.name, project.created_at]
    );
  } else {
    PROJECTS.set(project.project_id, project);
  }
}

export async function getProject(projectId) {
  if (db) {
    const result = await db.query('SELECT * FROM projects WHERE project_id = $1', [projectId]);
    return result.rows[0] || null;
  }
  return PROJECTS.get(projectId) || null;
}

// Agents
export async function createAgent(agent) {
  if (db) {
    await db.query(
      'INSERT INTO agents (agent_id, project_id, name, steps, retry_policy, timeout_seconds, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [agent.agent_id, agent.project_id, agent.name, JSON.stringify(agent.steps), JSON.stringify(agent.retry_policy), agent.timeout_seconds, agent.created_at]
    );
  } else {
    AGENTS.set(agent.agent_id, agent);
  }
}

export async function getAgent(agentId) {
  if (db) {
    const result = await db.query('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
    if (result.rows[0]) {
      const row = result.rows[0];
      return {
        ...row,
        steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
        retry_policy: typeof row.retry_policy === 'string' ? JSON.parse(row.retry_policy) : row.retry_policy
      };
    }
    return null;
  }
  return AGENTS.get(agentId) || null;
}

// Runs
export async function createRun(run) {
  if (db) {
    await db.query(
      'INSERT INTO runs (run_id, agent_id, project_id, input, webhook, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [run.run_id, run.agent_id, run.project_id, JSON.stringify(run.input), run.webhook, run.status, run.created_at]
    );
  } else {
    RUNS.set(run.run_id, run);
  }
}

export async function getRun(runId) {
  if (db) {
    const result = await db.query('SELECT * FROM runs WHERE run_id = $1', [runId]);
    if (result.rows[0]) {
      const row = result.rows[0];
      return {
        ...row,
        input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
        results: row.results ? (typeof row.results === 'string' ? JSON.parse(row.results) : row.results) : null
      };
    }
    return null;
  }
  return RUNS.get(runId) || null;
}

export async function updateRun(runId, updates) {
  if (db) {
    const sets = [];
    const values = [];
    let idx = 1;
    
    if (updates.status) { sets.push(`status = $${idx++}`); values.push(updates.status); }
    if (updates.started_at) { sets.push(`started_at = $${idx++}`); values.push(updates.started_at); }
    if (updates.completed_at) { sets.push(`completed_at = $${idx++}`); values.push(updates.completed_at); }
    if (updates.results) { sets.push(`results = $${idx++}`); values.push(JSON.stringify(updates.results)); }
    if (updates.error) { sets.push(`error = $${idx++}`); values.push(updates.error); }
    
    values.push(runId);
    await db.query(`UPDATE runs SET ${sets.join(', ')} WHERE run_id = $${idx}`, values);
  } else {
    const run = RUNS.get(runId);
    if (run) Object.assign(run, updates);
  }
}
