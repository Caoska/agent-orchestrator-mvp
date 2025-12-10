import { getDb } from "./db.js";
import { WORKSPACES, PROJECTS, TOOLS, AGENTS, RUNS } from "./store.js";

const db = getDb();

// Workspaces
export async function createWorkspace(workspace) {
  if (db) {
    await db.query(
      'INSERT INTO workspaces (workspace_id, name, owner_email, api_key, password_hash, plan, runs_this_month, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [workspace.workspace_id, workspace.name, workspace.owner_email, workspace.api_key, workspace.password_hash, workspace.plan || 'free', workspace.runs_this_month || 0, workspace.created_at]
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

export async function getWorkspaceByEmail(email) {
  if (db) {
    const result = await db.query('SELECT * FROM workspaces WHERE owner_email = $1', [email]);
    return result.rows[0] || null;
  }
  for (const ws of WORKSPACES.values()) {
    if (ws.owner_email === email) return ws;
  }
  return null;
}

export async function updateWorkspace(workspaceId, updates) {
  if (db) {
    const fields = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`).join(', ');
    await db.query(
      `UPDATE workspaces SET ${fields} WHERE workspace_id = $1`,
      [workspaceId, ...Object.values(updates)]
    );
  } else {
    const ws = WORKSPACES.get(workspaceId);
    if (ws) Object.assign(ws, updates);
  }
}

export async function incrementUsage(workspaceId, usage) {
  if (db) {
    await db.query(
      `UPDATE workspaces SET 
        steps_this_month = steps_this_month + $2,
        http_calls_this_month = http_calls_this_month + $3,
        webhooks_this_month = webhooks_this_month + $4,
        execution_seconds_this_month = execution_seconds_this_month + $5
      WHERE workspace_id = $1`,
      [workspaceId, usage.steps || 0, usage.http_calls || 0, usage.webhooks || 0, usage.execution_seconds || 0]
    );
  } else {
    const ws = WORKSPACES.get(workspaceId);
    if (ws) {
      ws.steps_this_month = (ws.steps_this_month || 0) + (usage.steps || 0);
      ws.http_calls_this_month = (ws.http_calls_this_month || 0) + (usage.http_calls || 0);
      ws.webhooks_this_month = (ws.webhooks_this_month || 0) + (usage.webhooks || 0);
      ws.execution_seconds_this_month = (ws.execution_seconds_this_month || 0) + (usage.execution_seconds || 0);
    }
  }
}

export async function getWorkspaceByStripeCustomer(customerId) {
  if (db) {
    const result = await db.query('SELECT * FROM workspaces WHERE stripe_customer_id = $1', [customerId]);
    return result.rows[0] || null;
  }
  for (const ws of WORKSPACES.values()) {
    if (ws.stripe_customer_id === customerId) return ws;
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

export async function listProjects(workspaceId) {
  if (db) {
    const result = await db.query('SELECT * FROM projects WHERE workspace_id = $1', [workspaceId]);
    return result.rows;
  }
  const projects = [];
  for (const project of PROJECTS.values()) {
    if (project.workspace_id === workspaceId) {
      projects.push(project);
    }
  }
  return projects;
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

export async function listAgents(workspaceId) {
  if (db) {
    const result = await db.query(
      'SELECT a.* FROM agents a JOIN projects p ON a.project_id = p.project_id WHERE p.workspace_id = $1',
      [workspaceId]
    );
    return result.rows.map(row => ({
      ...row,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      retry_policy: typeof row.retry_policy === 'string' ? JSON.parse(row.retry_policy) : row.retry_policy
    }));
  }
  const agents = [];
  for (const agent of AGENTS.values()) {
    const project = PROJECTS.get(agent.project_id);
    if (project && project.workspace_id === workspaceId) {
      agents.push(agent);
    }
  }
  return agents;
}

export async function deleteAgent(agentId) {
  if (db) {
    await db.query('DELETE FROM agents WHERE agent_id = $1', [agentId]);
  } else {
    AGENTS.delete(agentId);
  }
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
  console.log(`[updateRun] Updating ${runId} with:`, updates);
  if (db) {
    const fields = [];
    const values = [runId];
    let paramIndex = 2;
    
    if (updates.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updates.status);
    }
    if (updates.completed_at !== undefined) {
      fields.push(`completed_at = $${paramIndex++}`);
      values.push(updates.completed_at);
    }
    if (updates.started_at !== undefined) {
      fields.push(`started_at = $${paramIndex++}`);
      values.push(updates.started_at);
    }
    if (updates.results !== undefined) {
      fields.push(`results = $${paramIndex++}`);
      values.push(JSON.stringify(updates.results));
    }
    if (updates.error !== undefined) {
      fields.push(`error = $${paramIndex++}`);
      values.push(updates.error);
    }
    
    if (fields.length > 0) {
      await db.query(
        `UPDATE runs SET ${fields.join(', ')} WHERE run_id = $1`,
        values
      );
    }
  } else {
    const run = RUNS.get(runId);
    console.log(`[updateRun] In-memory mode, run found:`, !!run);
    if (run) {
      Object.assign(run, updates);
      console.log(`[updateRun] Updated run status:`, run.status);
    }
  }
}

export async function listRuns(workspaceId) {
  if (db) {
    const result = await db.query(
      'SELECT r.* FROM runs r JOIN agents a ON r.agent_id = a.agent_id JOIN projects p ON a.project_id = p.project_id WHERE p.workspace_id = $1 ORDER BY r.created_at DESC',
      [workspaceId]
    );
    return result.rows.map(row => ({
      ...row,
      input: typeof row.input === 'string' ? JSON.parse(row.input) : row.input,
      results: row.results ? (typeof row.results === 'string' ? JSON.parse(row.results) : row.results) : null
    }));
  }
  const runs = [];
  for (const run of RUNS.values()) {
    const agent = AGENTS.get(run.agent_id);
    if (agent) {
      const project = PROJECTS.get(agent.project_id);
      if (project && project.workspace_id === workspaceId) {
        runs.push(run);
      }
    }
  }
  return runs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}
