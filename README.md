# Agent Orchestrator MVP

This repo bootstraps the Agent Orchestrator MVP: Express API + BullMQ worker + minimal tools (HTTP + SMTP). Designed for quick deploy to Railway.

## Quick local dev (docker-compose)
1. Install Docker and Docker Compose.
2. Copy `.env.local.example` → `.env` and set env vars.
3. `docker-compose up --build`
4. API: http://localhost:4000
5. Worker logs: `docker-compose logs -f worker`

## Local without Docker (dev)
1. Install Redis locally or use `docker run -p 6379:6379 redis:6-alpine`.
2. Install deps: `npm ci`
3. Start server: `npm start`
4. Start worker in separate shell: `npm run worker`

## Environment variables
- REDIS_URL (e.g. redis://localhost:6379)
- DATABASE_URL (optional Postgres)
- PORT (defaults to 4000)
- QUEUE_NAME (optional)

## Deploy to Railway
1. Create a new Railway project.
2. Connect GitHub repo.
3. Add Redis plugin.
4. (Optional) Add Postgres plugin.
5. Set env vars in Railway (REDIS_URL, DATABASE_URL).
6. Railway will build Dockerfile and start the web service. Add a second service for the worker with command: npm run worker

## Next steps to production
- Replace in-memory stores with Postgres + migrations.
- Implement proper API key issuance & validation.
- Add KMS-based secret storage.
- Implement a secure sandbox for script steps.
- Add quota enforcement & Stripe billing.
- Add Sentry / Prometheus / alerting.
