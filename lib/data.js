import { getDb } from "./db.js";
import { WORKSPACES, PROJECTS, TOOLS, AGENTS, RUNS } from "./store.js";

// Workspaces
export async function createWorkspace(workspace) {
  const db = getDb();
  if (db) {
    await db.query(
      `INSERT INTO workspaces (
        workspace_id, name, owner_email, api_key, password_hash, 
        email_verified, verification_token, 
        plan, runs_this_month, emails_this_month, sms_this_month,
        llm_api_key, sendgrid_api_key, twilio_account_sid, twilio_auth_token,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        workspace.workspace_id, 
        workspace.name, 
        workspace.owner_email, 
        workspace.api_key, 
        workspace.password_hash,
        workspace.email_verified || false,
        workspace.verification_token,
        workspace.plan || 'free', 
        workspace.runs_this_month || 0,
        workspace.emails_this_month || 0,
        workspace.sms_this_month || 0,
        workspace.llm_api_key || null,
        workspace.sendgrid_api_key || null,
        workspace.twilio_account_sid || null,
        workspace.twilio_auth_token || null,
        workspace.created_at
      ]
    );
  } else {
    WORKSPACES.set(workspace.workspace_id, workspace);
  }
}

export async function getWorkspaceByApiKey(apiKey) {
  const db = getDb();
  if (db) {
    const result = await db.query('SELECT * FROM workspaces WHERE api_key = $1', [apiKey]);
    return result.rows[0] || null;
  }
  for (const ws of WORKSPACES.values()) {
    if (ws.api_key === apiKey) return ws;
  }
  return null;
}

export async function getWorkspace(workspaceId) {
  const db = getDb();
  if (db) {
    const result = await db.query('SELECT * FROM workspaces WHERE workspace_id = $1', [workspaceId]);
    return result.rows[0] || null;
  }
  return WORKSPACES.get(workspaceId) || null;
}

export async function getWorkspaceByEmail(email) {
  const db = getDb();
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
  const db = getDb();
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

export async function deleteWorkspace(workspaceId) {
  const db = getDb();
  if (db) {
    // Clean up scheduled jobs BEFORE deleting database records
    const schedules = await db.query('SELECT schedule_id FROM schedules s JOIN projects p ON s.project_id = p.project_id WHERE p.workspace_id = $1', [workspaceId]);
    
    if (schedules.rows.length > 0) {
      const { removeSchedule } = await import('./scheduler.js');
      for (const schedule of schedules.rows) {
        try {
          await removeSchedule(schedule.schedule_id);
          console.log(`Removed schedule ${schedule.schedule_id} for workspace ${workspaceId}`);
        } catch (error) {
          console.error(`Failed to remove schedule ${schedule.schedule_id}:`, error.message);
        }
      }
    }
    
    // Cascade delete will handle related records
    await db.query('DELETE FROM workspaces WHERE workspace_id = $1', [workspaceId]);
  } else {
    WORKSPACES.delete(workspaceId);
    // Clean up related data in memory
    for (const [key, value] of PROJECTS.entries()) {
      if (value.workspace_id === workspaceId) PROJECTS.delete(key);
    }
    for (const [key, value] of AGENTS.entries()) {
      const project = PROJECTS.get(value.project_id);
      if (project?.workspace_id === workspaceId) AGENTS.delete(key);
    }
    for (const [key, value] of RUNS.entries()) {
      const project = PROJECTS.get(value.project_id);
      if (project?.workspace_id === workspaceId) RUNS.delete(key);
    }
  }
}

export async function incrementUsage(workspaceId, usage) {
  const db = getDb();
  if (db) {
    try {
      console.log('Incrementing usage for workspace:', workspaceId, 'with data:', usage);
      const result = await db.query(
        `UPDATE workspaces SET 
          steps_this_month = steps_this_month + $2,
          http_calls_this_month = http_calls_this_month + $3,
          webhooks_this_month = webhooks_this_month + $4,
          execution_seconds_this_month = execution_seconds_this_month + $5,
          emails_this_month = emails_this_month + $6,
          sms_this_month = sms_this_month + $7
        WHERE workspace_id = $1`,
        [
          workspaceId, 
          usage.steps || 0, 
          usage.http_calls || 0, 
          usage.webhooks || 0, 
          usage.execution_seconds || 0,
          usage.platform_emails || 0,
          usage.platform_sms || 0
        ]
      );
      console.log('Usage update result:', result.rowCount, 'rows affected');
    } catch (error) {
      console.error('Error incrementing usage:', error);
      throw error;
    }
  } else {
    const ws = WORKSPACES.get(workspaceId);
    if (ws) {
      ws.steps_this_month = (ws.steps_this_month || 0) + (usage.steps || 0);
      ws.http_calls_this_month = (ws.http_calls_this_month || 0) + (usage.http_calls || 0);
      ws.webhooks_this_month = (ws.webhooks_this_month || 0) + (usage.webhooks || 0);
      ws.execution_seconds_this_month = (ws.execution_seconds_this_month || 0) + (usage.execution_seconds || 0);
      ws.emails_this_month = (ws.emails_this_month || 0) + (usage.platform_emails || 0);
      ws.sms_this_month = (ws.sms_this_month || 0) + (usage.platform_sms || 0);
    }
  }
}

export async function getWorkspaceByStripeCustomer(customerId) {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  if (db) {
    const result = await db.query('SELECT * FROM projects WHERE project_id = $1', [projectId]);
    return result.rows[0] || null;
  }
  return PROJECTS.get(projectId) || null;
}

export async function listProjects(workspaceId) {
  const db = getDb();
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
  const db = getDb();
  if (db) {
    if (agent.nodes && agent.connections) {
      // New graph format
      await db.query(
        'INSERT INTO agents (agent_id, project_id, name, steps, nodes, connections, retry_policy, timeout_seconds, webhook_secret, trigger_config, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [agent.agent_id, agent.project_id, agent.name, null, JSON.stringify(agent.nodes), JSON.stringify(agent.connections), JSON.stringify(agent.retry_policy), agent.timeout_seconds, agent.webhook_secret, JSON.stringify(agent.trigger || null), agent.created_at]
      );
    } else {
      // Legacy steps format
      await db.query(
        'INSERT INTO agents (agent_id, project_id, name, steps, retry_policy, timeout_seconds, webhook_secret, trigger_config, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [agent.agent_id, agent.project_id, agent.name, JSON.stringify(agent.steps), JSON.stringify(agent.retry_policy), agent.timeout_seconds, agent.webhook_secret, JSON.stringify(agent.trigger || null), agent.created_at]
      );
    }
  } else {
    AGENTS.set(agent.agent_id, agent);
  }
}

export async function getAgent(agentId) {
  const db = getDb();
  if (db) {
    const result = await db.query('SELECT * FROM agents WHERE agent_id = $1', [agentId]);
    if (result.rows[0]) {
      const row = result.rows[0];
      const agent = {
        ...row,
        retry_policy: typeof row.retry_policy === 'string' ? JSON.parse(row.retry_policy) : row.retry_policy,
        trigger: row.trigger_config ? (typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : row.trigger_config) : null
      };
      
      // Parse steps, nodes, connections based on what's present
      if (row.steps) {
        agent.steps = typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps;
      }
      if (row.nodes) {
        agent.nodes = typeof row.nodes === 'string' ? JSON.parse(row.nodes) : row.nodes;
      }
      if (row.connections) {
        agent.connections = typeof row.connections === 'string' ? JSON.parse(row.connections) : row.connections;
      }
      
      return agent;
    }
    return null;
  }
  return AGENTS.get(agentId) || null;
}

export async function updateAgent(agentId, updates) {
  const db = getDb();
  if (db) {
    const fields = [];
    const values = [];
    let idx = 1;
    
    if (updates.name) {
      fields.push(`name = $${idx++}`);
      values.push(updates.name);
    }
    if (updates.steps) {
      fields.push(`steps = $${idx++}`);
      values.push(JSON.stringify(updates.steps));
    }
    if (updates.retry_policy) {
      fields.push(`retry_policy = $${idx++}`);
      values.push(JSON.stringify(updates.retry_policy));
    }
    if (updates.timeout_seconds) {
      fields.push(`timeout_seconds = $${idx++}`);
      values.push(updates.timeout_seconds);
    }
    if (updates.trigger !== undefined) {
      fields.push(`trigger_config = $${idx++}`);
      values.push(JSON.stringify(updates.trigger));
    }
    
    values.push(agentId);
    await db.query(`UPDATE agents SET ${fields.join(', ')} WHERE agent_id = $${idx}`, values);
  } else {
    const agent = AGENTS.get(agentId);
    if (agent) Object.assign(agent, updates);
  }
}

export async function listAgents(workspaceId) {
  const db = getDb();
  if (db) {
    const result = await db.query(
      'SELECT a.* FROM agents a JOIN projects p ON a.project_id = p.project_id WHERE p.workspace_id = $1',
      [workspaceId]
    );
    return result.rows.map(row => ({
      ...row,
      steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
      retry_policy: typeof row.retry_policy === 'string' ? JSON.parse(row.retry_policy) : row.retry_policy,
      trigger: row.trigger_config ? (typeof row.trigger_config === 'string' ? JSON.parse(row.trigger_config) : row.trigger_config) : null
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

export async function listSchedules() {
  const db = getDb();
  if (db) {
    const result = await db.query('SELECT * FROM schedules WHERE enabled = true');
    return result.rows;
  }
  return [];
}

export async function deleteAgent(agentId) {
  const db = getDb();
  if (db) {
    // Get all schedules for this agent before deleting
    const schedulesResult = await db.query('SELECT schedule_id FROM schedules WHERE agent_id = $1', [agentId]);
    
    // Clean up BullMQ scheduled jobs
    if (schedulesResult.rows.length > 0) {
      const { removeSchedule } = await import('./scheduler.js');
      for (const schedule of schedulesResult.rows) {
        try {
          await removeSchedule(schedule.schedule_id);
        } catch (error) {
          console.error(`Failed to remove schedule ${schedule.schedule_id}:`, error);
        }
      }
    }
    
    // Delete agent (schedules will be cascade deleted)
    await db.query('DELETE FROM agents WHERE agent_id = $1', [agentId]);
  } else {
    AGENTS.delete(agentId);
  }
}

// Runs
export async function createRun(run) {
  const db = getDb();
  if (db) {
    // Verify agent exists before creating run
    const agentCheck = await db.query('SELECT agent_id FROM agents WHERE agent_id = $1', [run.agent_id]);
    if (agentCheck.rows.length === 0) {
      console.error(`Agent ${run.agent_id} not found in database. Available agents:`, 
        (await db.query('SELECT agent_id, name FROM agents ORDER BY created_at DESC LIMIT 5')).rows);
      throw new Error(`Agent ${run.agent_id} not found`);
    }
    
    await db.query(
      'INSERT INTO runs (run_id, agent_id, project_id, input, webhook, trigger_type, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
      [run.run_id, run.agent_id, run.project_id, JSON.stringify(run.input), run.webhook, run.trigger_type || 'manual', run.status, run.created_at]
    );
  } else {
    RUNS.set(run.run_id, run);
  }
}

export async function getRun(runId) {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
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
