import { Queue } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";
import * as data from "./data.js";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const runQueue = new Queue(QUEUE_NAME, { connection });

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
