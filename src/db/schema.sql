CREATE TABLE IF NOT EXISTS workspaces (
  workspace_id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_email VARCHAR(255),
  api_key VARCHAR(255) UNIQUE NOT NULL,
  plan VARCHAR(50) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  runs_this_month INTEGER DEFAULT 0,
  emails_this_month INTEGER DEFAULT 0,
  sms_this_month INTEGER DEFAULT 0,
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
  agent_id VARCHAR(255) REFERENCES agents(agent_id) ON DELETE CASCADE,
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

CREATE INDEX idx_workspaces_api_key ON workspaces(api_key);
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_tools_project ON tools(project_id);
CREATE INDEX idx_agents_project ON agents(project_id);
CREATE INDEX idx_runs_agent ON runs(agent_id);
CREATE INDEX idx_runs_status ON runs(status);
