import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import * as data from "./data.js";
import { resetMonthlyUsage, MONTHLY_RESET_CRON } from "./monthly-reset.js";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL;
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

// Periodic cleanup of orphaned schedules (runs every hour)
export async function initializeOrphanedJobCleanup() {
  try {
    // Remove existing cleanup job if it exists
    const repeatableJobs = await runQueue.getRepeatableJobs();
    const existingJob = repeatableJobs.find(j => j.id === 'orphaned_job_cleanup');
    if (existingJob) {
      await runQueue.removeRepeatableByKey(existingJob.key);
    }

    // Add new cleanup job (every hour)
    await runQueue.add(
      'orphaned_cleanup',
      {},
      {
        repeat: { pattern: '0 * * * *' }, // Every hour at minute 0
        jobId: 'orphaned_job_cleanup',
        removeOnComplete: true,
        removeOnFail: false
      }
    );
    
    console.log('✅ Orphaned job cleanup scheduled (hourly)');
  } catch (error) {
    console.error('❌ Failed to initialize orphaned job cleanup:', error.message);
  }
}

// Process schedule cleanup queue (triggered by database cascade deletes)
export async function processScheduleCleanupQueue() {
  try {
    const { getDb } = await import('./data.js');
    const db = getDb();
    
    if (!db) {
      console.log('No database connection, skipping cleanup queue processing');
      return 0;
    }

    // Get unprocessed cleanup requests
    const cleanupRequests = await db.query(`
      SELECT id, schedule_id, agent_id 
      FROM schedule_cleanup_queue 
      WHERE processed = false 
      ORDER BY deleted_at ASC 
      LIMIT 100
    `);

    if (cleanupRequests.rows.length === 0) {
      return 0;
    }

    console.log(`Processing ${cleanupRequests.rows.length} schedule cleanup requests`);

    let processed = 0;
    for (const request of cleanupRequests.rows) {
      try {
        // Remove the Redis repeatable job
        const removed = await removeSchedule(request.schedule_id);
        
        // Mark as processed regardless of success (to avoid infinite retries)
        await db.query(
          'UPDATE schedule_cleanup_queue SET processed = true WHERE id = $1',
          [request.id]
        );
        
        if (removed) {
          console.log(`Cleaned up Redis job for schedule ${request.schedule_id} (agent ${request.agent_id})`);
        } else {
          console.log(`Redis job for schedule ${request.schedule_id} was already removed or not found`);
        }
        
        processed++;
      } catch (error) {
        console.error(`Failed to cleanup schedule ${request.schedule_id}:`, error.message);
        // Mark as processed to avoid infinite retries
        await db.query(
          'UPDATE schedule_cleanup_queue SET processed = true WHERE id = $1',
          [request.id]
        );
      }
    }

    // Clean up old processed records (older than 7 days)
    await db.query(`
      DELETE FROM schedule_cleanup_queue 
      WHERE processed = true AND deleted_at < NOW() - INTERVAL '7 days'
    `);

    return processed;
  } catch (error) {
    console.error('Error processing schedule cleanup queue:', error.message);
    return 0;
  }
}
export async function cleanupAllOrphanedJobs() {
  try {
    const { getDb } = await import('./data.js');
    const db = getDb();
    
    if (!db) {
      console.log('No database connection, skipping orphaned job cleanup');
      return 0;
    }

    // Find schedules for agents that no longer exist
    const orphanedSchedules = await db.query(`
      SELECT s.schedule_id, s.agent_id 
      FROM schedules s 
      LEFT JOIN agents a ON s.agent_id = a.agent_id 
      WHERE a.agent_id IS NULL
    `);

    console.log(`Found ${orphanedSchedules.rows.length} orphaned schedules`);

    let cleaned = 0;
    for (const schedule of orphanedSchedules.rows) {
      try {
        const removed = await removeSchedule(schedule.schedule_id);
        if (removed) {
          await db.query('DELETE FROM schedules WHERE schedule_id = $1', [schedule.schedule_id]);
          console.log(`Cleaned up orphaned schedule ${schedule.schedule_id} for deleted agent ${schedule.agent_id}`);
          cleaned++;
        }
      } catch (error) {
        console.error(`Failed to cleanup schedule ${schedule.schedule_id}:`, error.message);
      }
    }

    return cleaned;
  } catch (error) {
    console.error('Error in orphaned job cleanup:', error.message);
    return 0;
  }
}
export async function initializeMonthlyReset() {
  try {
    // Remove existing monthly reset job if it exists
    const repeatableJobs = await runQueue.getRepeatableJobs();
    const existingJob = repeatableJobs.find(j => j.id === 'monthly_usage_reset');
    if (existingJob) {
      await runQueue.removeRepeatableByKey(existingJob.key);
    }

    // Add monthly reset job
    await runQueue.add(
      "monthly_reset",
      { type: "monthly_usage_reset" },
      {
        repeat: { pattern: MONTHLY_RESET_CRON },
        jobId: 'monthly_usage_reset',
        removeOnComplete: true,
        removeOnFail: false
      }
    );
    console.log('Monthly usage reset scheduled for 1st of each month at midnight UTC');
  } catch (error) {
    console.error('Error initializing monthly reset:', error);
  }
}

// Schedule format: cron expression or interval in seconds
export async function scheduleRun(schedule) {
  const { schedule_id, agent_id, project_id, input, cron, interval_seconds } = schedule;
  
  if (cron) {
    // Use BullMQ's repeat option with cron
    await runQueue.add(
      "run",
      { agent_id, project_id, input, scheduled: true },
      {
        repeat: { pattern: cron },
        jobId: `schedule_${schedule_id}`,
        removeOnComplete: true,
        removeOnFail: false
      }
    );
  } else if (interval_seconds) {
    // Use BullMQ's repeat option with interval
    await runQueue.add(
      "run",
      { agent_id, project_id, input, scheduled: true },
      {
        repeat: { every: interval_seconds * 1000 },
        jobId: `schedule_${schedule_id}`,
        removeOnComplete: true,
        removeOnFail: false
      }
    );
  }
}

export async function removeSchedule(schedule_id) {
  try {
    // Get all repeatable jobs and find the one with matching jobId
    const repeatableJobs = await runQueue.getRepeatableJobs();
    console.log(`Looking for schedule_${schedule_id} among ${repeatableJobs.length} repeatable jobs`);
    
    // BullMQ repeatable jobs store the original jobId in the job data, not the id field
    // The id field is auto-generated by BullMQ for repeatable jobs
    let job = repeatableJobs.find(j => j.id === `schedule_${schedule_id}`);
    
    // If not found by id, search by key pattern (fallback)
    if (!job) {
      job = repeatableJobs.find(j => j.key && j.key.includes(`schedule_${schedule_id}`));
    }
    
    // If still not found, try to find by job data (requires getting job details)
    if (!job) {
      for (const repeatableJob of repeatableJobs) {
        try {
          // Check if this is our job by examining the repeat options
          if (repeatableJob.id && repeatableJob.id.includes('schedule_')) {
            job = repeatableJob;
            break;
          }
        } catch (e) {
          // Skip jobs we can't examine
          continue;
        }
      }
    }
    
    if (job) {
      await runQueue.removeRepeatableByKey(job.key);
      console.log(`Successfully removed repeatable job: ${job.id} (key: ${job.key})`);
      return true;
    } else {
      console.log(`No repeatable job found for schedule_${schedule_id}`);
      // List all job IDs for debugging
      const jobIds = repeatableJobs.map(j => `${j.id} (key: ${j.key?.substring(0, 30)}...)`);
      console.log(`Available jobs: ${jobIds.join(', ')}`);
      return false;
    }
  } catch (error) {
    console.error(`Error removing schedule ${schedule_id}:`, error.message);
    throw error;
  }
}

export async function listSchedules() {
  const repeatableJobs = await runQueue.getRepeatableJobs();
  return repeatableJobs;
}

// Nuclear option: clear ALL repeatable jobs
export async function clearAllRepeatableJobs() {
  try {
    const repeatableJobs = await runQueue.getRepeatableJobs();
    console.log(`Clearing ${repeatableJobs.length} repeatable jobs...`);
    
    for (const job of repeatableJobs) {
      await runQueue.removeRepeatableByKey(job.key);
      console.log(`Cleared job: ${job.id}`);
    }
    
    console.log('All repeatable jobs cleared');
  } catch (error) {
    console.error('Error clearing repeatable jobs:', error.message);
    throw error;
  }
}

// Clean up orphaned repeatable jobs (jobs for deleted agents)
export async function cleanupOrphanedJobs() {
  try {
    const repeatableJobs = await runQueue.getRepeatableJobs();
    const { getDb } = await import('./data.js');
    const db = getDb();
    
    if (!db) {
      console.log('No database connection, skipping orphaned job cleanup');
      return;
    }
    
    let cleaned = 0;
    for (const job of repeatableJobs) {
      // Skip non-schedule jobs
      if (!job.id || !job.id.startsWith('schedule_')) continue;
      
      const schedule_id = job.id.replace('schedule_', '');
      
      // Check if schedule exists in database
      const result = await db.query('SELECT schedule_id FROM schedules WHERE schedule_id = $1', [schedule_id]);
      
      if (result.rows.length === 0) {
        // Orphaned job - remove it
        await runQueue.removeRepeatableByKey(job.key);
        console.log(`Removed orphaned repeatable job: ${job.id}`);
        cleaned++;
      }
    }
    
    console.log(`Cleaned up ${cleaned} orphaned repeatable jobs`);
    return cleaned;
  } catch (error) {
    console.error('Error cleaning up orphaned jobs:', error.message);
    throw error;
  }
}

// Clean up orphaned repeatable jobs for a specific agent
export async function cleanupOrphanedJobsForAgent(agent_id) {
  try {
    const repeatableJobs = await runQueue.getRepeatableJobs();
    const { getDb } = await import('./data.js');
    const db = getDb();
    
    if (!db) {
      console.log('No database connection, skipping agent job cleanup');
      return 0;
    }

    let cleaned = 0;
    
    // Get all schedules for this agent from the database
    const agentSchedules = await db.query('SELECT schedule_id FROM schedules WHERE agent_id = $1', [agent_id]);
    const agentScheduleIds = agentSchedules.rows.map(row => row.schedule_id);
    
    console.log(`Found ${agentScheduleIds.length} schedules for agent ${agent_id}: ${agentScheduleIds.join(', ')}`);
    
    // Remove all repeatable jobs for this agent's schedules
    for (const schedule_id of agentScheduleIds) {
      const jobIdToFind = `schedule_${schedule_id}`;
      
      // Find the repeatable job by ID or key pattern
      let job = repeatableJobs.find(j => j.id === jobIdToFind);
      
      if (!job) {
        // Fallback: search by key pattern
        job = repeatableJobs.find(j => j.key && j.key.includes(jobIdToFind));
      }
      
      if (job) {
        await runQueue.removeRepeatableByKey(job.key);
        console.log(`Removed orphaned repeatable job for agent ${agent_id}, schedule ${schedule_id}: ${job.id}`);
        cleaned++;
      } else {
        console.log(`No repeatable job found for schedule ${schedule_id} of agent ${agent_id}`);
      }
    }
    
    // Also clean up the database records for this agent
    if (agentScheduleIds.length > 0) {
      await db.query('DELETE FROM schedules WHERE agent_id = $1', [agent_id]);
      console.log(`Deleted ${agentScheduleIds.length} schedule records for agent ${agent_id}`);
    }
    
    return cleaned;
  } catch (error) {
    console.error(`Error cleaning up orphaned jobs for agent ${agent_id}:`, error.message);
    throw error;
  }
}
