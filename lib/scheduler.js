import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import * as data from "./data.js";
import { resetMonthlyUsage, MONTHLY_RESET_CRON } from "./monthly-reset.js";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

// Initialize monthly reset schedule
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
    
    const job = repeatableJobs.find(j => j.id === `schedule_${schedule_id}`);
    
    if (job) {
      await runQueue.removeRepeatableByKey(job.key);
      console.log(`Successfully removed repeatable job: schedule_${schedule_id}`);
    } else {
      console.log(`No repeatable job found for schedule_${schedule_id}`);
      // List all job IDs for debugging
      const jobIds = repeatableJobs.map(j => j.id);
      console.log(`Available job IDs: ${jobIds.join(', ')}`);
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
