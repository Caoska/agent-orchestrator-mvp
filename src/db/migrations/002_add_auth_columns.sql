-- Add authentication and verification columns to workspaces table
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMP;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS llm_api_key TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS sendgrid_api_key TEXT;
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twilio_account_sid VARCHAR(255);
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS twilio_auth_token VARCHAR(255);
