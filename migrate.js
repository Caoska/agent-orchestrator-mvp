import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    // Create tables if they don't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS workspaces (
        workspace_id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        owner_email VARCHAR(255),
        api_key VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    // Add missing columns to workspaces
    await client.query(`
      ALTER TABLE workspaces 
      ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free',
      ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS runs_this_month INTEGER DEFAULT 0;
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        project_id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255) REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id VARCHAR(255) PRIMARY KEY,
        project_id VARCHAR(255) REFERENCES projects(project_id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        steps JSONB NOT NULL,
        retry_policy JSONB DEFAULT '{}',
        timeout_seconds INTEGER DEFAULT 300,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    
    await client.query(`
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
    `);
    
    console.log('✓ Database schema migrated');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
