import pg from 'pg';

const { Pool } = pg;

async function migrate() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 30000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 1
  });
  
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      
      // Workspaces table
      await client.query(`
        CREATE TABLE IF NOT EXISTS workspaces (
          workspace_id VARCHAR(255) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          owner_email VARCHAR(255),
          api_key VARCHAR(255) UNIQUE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        ALTER TABLE workspaces 
        ADD COLUMN IF NOT EXISTS plan VARCHAR(50) DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS runs_this_month INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
        ADD COLUMN IF NOT EXISTS steps_this_month INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS http_calls_this_month INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS webhooks_this_month INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS execution_seconds_this_month INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS llm_api_key VARCHAR(255),
        ADD COLUMN IF NOT EXISTS sendgrid_api_key VARCHAR(255);
      `);
      
      // Rename old column if it exists
      await client.query(`
        DO $$ 
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'workspaces' AND column_name = 'openai_api_key'
          ) THEN
            ALTER TABLE workspaces RENAME COLUMN openai_api_key TO llm_api_key;
          END IF;
        END $$;
      `);
      
      // Projects table
      await client.query(`
        CREATE TABLE IF NOT EXISTS projects (
          project_id VARCHAR(255) PRIMARY KEY,
          workspace_id VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        ALTER TABLE projects
        ADD COLUMN IF NOT EXISTS workspace_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS name VARCHAR(255),
        ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
      `);
      
      // Agents table
      await client.query(`
        CREATE TABLE IF NOT EXISTS agents (
          agent_id VARCHAR(255) PRIMARY KEY,
          project_id VARCHAR(255),
          name VARCHAR(255) NOT NULL,
          steps JSONB NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS retry_policy JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER DEFAULT 300,
        ADD COLUMN IF NOT EXISTS webhook_secret VARCHAR(255);
      `);
      
      // Runs table
      await client.query(`
        CREATE TABLE IF NOT EXISTS runs (
          run_id VARCHAR(255) PRIMARY KEY,
          agent_id VARCHAR(255),
          project_id VARCHAR(255),
          status VARCHAR(50) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      await client.query(`
        ALTER TABLE runs
        ADD COLUMN IF NOT EXISTS input JSONB DEFAULT '{}',
        ADD COLUMN IF NOT EXISTS webhook VARCHAR(500),
        ADD COLUMN IF NOT EXISTS results JSONB,
        ADD COLUMN IF NOT EXISTS error TEXT,
        ADD COLUMN IF NOT EXISTS started_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
      `);
      
      // Fix runs foreign key to preserve runs when agent is deleted
      await client.query(`
        DO $$ 
        BEGIN
          IF EXISTS (
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_name = 'runs_agent_id_fkey'
          ) THEN
            ALTER TABLE runs DROP CONSTRAINT runs_agent_id_fkey;
          END IF;
          
          ALTER TABLE runs 
          ADD CONSTRAINT runs_agent_id_fkey 
          FOREIGN KEY (agent_id) REFERENCES agents(agent_id) ON DELETE SET NULL;
        END $$;
      `);
      
      console.log('✓ Database schema migrated');
      client.release();
      await pool.end();
      process.exit(0);
    } catch (err) {
      retries--;
      console.error(`Migration attempt failed (${5 - retries}/5):`, err.message);
      if (retries === 0) {
        console.error('Migration failed after 5 attempts');
        process.exit(1);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

migrate();
