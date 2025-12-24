-- Migration: Add trigger to cleanup Redis jobs when schedules are deleted
-- This ensures Redis repeatable jobs are removed when schedules are cascade deleted

-- Create a function to cleanup Redis jobs (placeholder - actual cleanup happens in app)
CREATE OR REPLACE FUNCTION notify_schedule_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a notification that can be picked up by the application
  INSERT INTO schedule_cleanup_queue (schedule_id, agent_id, deleted_at)
  VALUES (OLD.schedule_id, OLD.agent_id, NOW());
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create cleanup queue table
CREATE TABLE IF NOT EXISTS schedule_cleanup_queue (
  id SERIAL PRIMARY KEY,
  schedule_id VARCHAR(255) NOT NULL,
  agent_id VARCHAR(255) NOT NULL,
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed BOOLEAN DEFAULT false
);

-- Create trigger on schedules table
DROP TRIGGER IF EXISTS schedule_deletion_trigger ON schedules;
CREATE TRIGGER schedule_deletion_trigger
  AFTER DELETE ON schedules
  FOR EACH ROW
  EXECUTE FUNCTION notify_schedule_deletion();

-- Create index for efficient cleanup processing
CREATE INDEX IF NOT EXISTS idx_schedule_cleanup_unprocessed ON schedule_cleanup_queue(processed, deleted_at);
