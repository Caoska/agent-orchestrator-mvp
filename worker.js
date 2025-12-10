import { Worker } from "bullmq";
import IORedis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const QUEUE_NAME = process.env.QUEUE_NAME || "runs";
const connection = new IORedis(REDIS_URL);

const worker = new Worker(
QUEUE_NAME,
async job => {
const { run_id } = job.data;
console.log("Worker: processing run", run_id);
// TODO: in prod fetch run/agent from DB and execute steps
// For MVP: signal done
return { ok: true, run_id };
},
{ connection }
);

worker.on("completed", job => {
console.log("Job completed", job.id);
});
worker.on("failed", (job, err) => {
console.error("Job failed", job?.id, err);
});
