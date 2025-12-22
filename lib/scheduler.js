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
  // Get all repeatable jobs and find the one with matching jobId
  const repeatableJobs = await runQueue.getRepeatableJobs();
  const job = repeatableJobs.find(j => j.id === `schedule_${schedule_id}`);
  
  if (job) {
    await runQueue.removeRepeatableByKey(job.key);
  }
}

export async function listSchedules() {
  const repeatableJobs = await runQueue.getRepeatableJobs();
  return repeatableJobs;
}
