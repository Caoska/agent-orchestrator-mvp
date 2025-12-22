-- Add nodes and connections columns for graph-based workflows
-- Migration: 003_add_graph_workflow_columns.sql

-- Add new columns for graph format
ALTER TABLE agents ADD COLUMN IF NOT EXISTS nodes JSONB;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS connections JSONB;

-- Make steps column nullable to support both formats
ALTER TABLE agents ALTER COLUMN steps DROP NOT NULL;

-- Add constraint to ensure at least one workflow format is present
ALTER TABLE agents ADD CONSTRAINT agents_workflow_check CHECK (
  (steps IS NOT NULL) OR (nodes IS NOT NULL AND connections IS NOT NULL)
);
