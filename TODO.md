# Agent Orchestrator MVP - TODO

## Features to Add

### Tools
- [ ] File Storage (S3/R2) - Upload/download files
- [ ] SMTP Testing - Email tool is implemented but not tested
- [ ] Tool References - Use registered tools instead of inline config

### Core Features
- [ ] Branching - Execute different steps based on conditional results
- [ ] Loops - Iterate over arrays
- [ ] Error Handling - Retry policies, fallbacks
- [ ] Timeouts - Per-step and per-run timeouts
- [ ] Webhooks - Notify external URLs when runs complete
- [ ] Secrets Management - Secure storage for API keys, passwords
- [ ] Rate Limiting - Prevent abuse

### API Improvements
- [ ] Pagination - List endpoints (agents, runs, etc.)
- [ ] Filtering - Search/filter runs by status, date, etc.
- [ ] Bulk Operations - Delete multiple resources
- [ ] API Versioning - v2 endpoints
- [ ] GraphQL API - Alternative to REST

### Monitoring & Observability
- [ ] Logging - Structured logs for debugging
- [ ] Metrics - Track run duration, success rate, etc.
- [ ] Alerting - Notify on failures
- [ ] Tracing - Distributed tracing for multi-step workflows

### Security
- [ ] API Key Rotation - Regenerate keys
- [ ] IP Whitelisting - Restrict access by IP
- [ ] Audit Logs - Track all API calls
- [ ] Encryption - Encrypt sensitive data at rest

### Developer Experience
- [ ] SDK - JavaScript/Python client libraries
- [ ] CLI - Command-line tool for managing agents
- [ ] Web UI - Dashboard for managing workspaces/agents/runs
- [ ] Documentation - API docs, tutorials, examples
- [ ] Webhooks Testing - Test webhook endpoints

### Infrastructure
- [ ] Horizontal Scaling - Multiple worker instances
- [ ] Queue Priorities - High-priority runs
- [ ] Dead Letter Queue - Handle failed jobs
- [ ] Backup & Restore - Database backups
- [ ] Multi-region - Deploy to multiple regions

## Current Status

### ✅ Completed
- [x] API Server (Express)
- [x] Worker (BullMQ)
- [x] Redis Queue
- [x] Postgres Storage
- [x] API Key Authentication
- [x] Workspace Isolation
- [x] HTTP Tool (GET/POST/PUT/DELETE)
- [x] Webhook Tool
- [x] Delay Tool
- [x] Conditional Tool
- [x] Transform Tool
- [x] Database Tool
- [x] SMTP Tool (implemented)
- [x] Template Variables
- [x] Railway Deployment

## Priority Order

1. **Web UI** - Makes it usable for non-developers
2. **Error Handling** - Critical for production
3. **Branching** - Unlock complex workflows
4. **Documentation** - Help users get started
5. **SDK** - Easier integration
