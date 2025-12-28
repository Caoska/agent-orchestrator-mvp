# Project Structure

```
agent-orchestrator-mvp/
├── src/
│   ├── server/
│   │   └── index.js              # Main Express API server
│   ├── worker/
│   │   └── index.js              # BullMQ worker for job execution
│   └── db/
│       ├── migrate.js            # Migration runner
│       ├── schema.sql            # Database schema
│       └── migrations/           # Database migrations
├── lib/                          # Shared utilities
│   ├── db.js                     # Database connection & queries
│   ├── data.js                   # Data access layer
│   ├── tools.js                  # Tool executors (HTTP, email, SMS, etc.)
│   ├── scheduler.js              # Cron scheduling
│   ├── templates.js              # Agent templates
│   ├── stripe.js                 # Payment integration
│   ├── webhooks.js               # Webhook utilities
│   ├── ratelimit.js              # Rate limiting
│   ├── templating.js             # Template engine
│   ├── store.js                  # In-memory store
│   ├── health.js                 # Health check utilities
│   ├── logger.js                 # Structured logging
│   ├── metrics.js                # Usage metrics tracking
│   ├── middleware.js             # Express middleware
│   ├── email-templates.js        # Email template rendering
│   ├── usage-notifications.js    # Usage limit notifications
│   └── monthly-reset.js          # Monthly usage reset
├── public/                       # Static backend pages
│   ├── index.html                # Basic landing page
│   ├── docs.html                 # API documentation
│   └── pricing.html              # Pricing page
├── tests/                        # Test files
├── scripts/                      # Development and utility scripts
├── start.js                      # Entry point (handles Railway service routing)
└── package.json
```

## Frontend

The main frontend is a separate React application at `siloworker-ui` repository, deployed to `siloworker.dev`.

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

- **Main service**: runs `start.js` → server (API)
- **Worker service**: runs `start.js` → worker (via RAILWAY_SERVICE_NAME)
- **Frontend**: separate deployment from siloworker-ui repo
