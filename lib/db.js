import pg from "pg";
const { Pool } = pg;

let pool = null;

export function getDb() {
  if (!pool && process.env.DATABASE_URL) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
  }
  return pool;
}

export async function initDb() {
  const db = getDb();
  if (!db) return; // No DATABASE_URL, skip DB
  
  // Run schema
  const schema = `
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id VARCHAR(255) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      owner_email VARCHAR(255),
      api_key VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id VARCHAR(255) PRIMARY KEY,
      workspace_id VARCHAR(255) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tools (
      tool_id VARCHAR(255) PRIMARY KEY,
      project_id VARCHAR(255) REFERENCES projects(project_id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      config JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agents (
      agent_id VARCHAR(255) PRIMARY KEY,
      project_id VARCHAR(255) REFERENCES projects(project_id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      steps JSONB NOT NULL,
      retry_policy JSONB DEFAULT '{}',
      timeout_seconds INTEGER DEFAULT 300,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS runs (
      run_id VARCHAR(255) PRIMARY KEY,
      agent_id VARCHAR(255) REFERENCES agents(agent_id) ON DELETE SET NULL,
      project_id VARCHAR(255) REFERENCES projects(project_id) ON DELETE CASCADE,
      input JSONB DEFAULT '{}',
      webhook VARCHAR(500),
      status VARCHAR(50) NOT NULL,
      results JSONB,
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS schedules (
      schedule_id VARCHAR(255) PRIMARY KEY,
      agent_id VARCHAR(255) REFERENCES agents(agent_id) ON DELETE CASCADE,
      project_id VARCHAR(255) REFERENCES projects(project_id) ON DELETE CASCADE,
      input JSONB DEFAULT '{}',
      cron VARCHAR(100),
      interval_seconds INTEGER,
      enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_workspaces_api_key ON workspaces(api_key);
    CREATE INDEX IF NOT EXISTS idx_projects_workspace ON projects(workspace_id);
    CREATE INDEX IF NOT EXISTS idx_tools_project ON tools(project_id);
    CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
    CREATE INDEX IF NOT EXISTS idx_runs_agent ON runs(agent_id);
    CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
    CREATE INDEX IF NOT EXISTS idx_schedules_agent ON schedules(agent_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_enabled ON schedules(enabled);
  `;
  
  await db.query(schema);
  console.log("Database initialized");
}
