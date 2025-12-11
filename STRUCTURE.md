# Project Structure

```
agent-orchestrator-mvp/
├── src/
│   ├── server/
│   │   ├── index.js              # Main server (Express API)
│   │   ├── routes/               # TODO: Split routes from index.js
│   │   └── middleware/           # TODO: Extract middleware
│   ├── worker/
│   │   └── index.js              # BullMQ worker for job execution
│   └── db/
│       ├── migrate.js            # Migration runner
│       ├── schema.sql            # Schema reference
│       └── migrations/           # TODO: Versioned migrations
├── lib/                          # Shared utilities
│   ├── db.js                     # Database connection
│   ├── data.js                   # Data access layer
│   ├── tools.js                  # Tool executors
│   ├── scheduler.js              # Cron scheduling
│   ├── stripe.js                 # Payment integration
│   ├── templates.js              # Agent templates
│   ├── webhooks.js               # Webhook utilities
│   ├── ratelimit.js              # Rate limiting
│   ├── templating.js             # Template engine
│   └── store.js                  # In-memory store
├── public/                       # Frontend (to be replaced with React)
│   ├── index.html
│   ├── docs.html
│   └── pricing.html
├── tests/                        # All test files
├── scripts/                      # Dev and test scripts
├── start.js                      # Entry point (handles Railway routing)
└── package.json
```

## Running Locally

```bash
# Server only
node src/server/index.js

# Worker only  
node src/worker/index.js

# Both (via start.js)
npm start
```

## Railway Deployment

- Main service runs `start.js` → server
- Worker service runs `start.js` → worker (via RAILWAY_SERVICE_NAME)
