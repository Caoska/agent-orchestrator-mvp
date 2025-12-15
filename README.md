# SiloWorker - Agent Orchestrator Platform

API-first workflow automation platform with advanced configurations and monitoring capabilities.

## 🚀 Features

- **API-First Design** - Complete REST API with OpenAPI documentation
- **Usage Monitoring** - Proactive notifications at 80%, 90%, 95% limits
- **Prometheus Metrics** - Production-ready monitoring and alerting
- **Enhanced Error Handling** - Detailed error responses with usage context
- **Multi-Tool Support** - HTTP, SendGrid, Twilio, Database, LLM, and more
- **Template Library** - Pre-built workflows for common use cases
- **Flexible Pricing** - Free to Enterprise tiers with usage tracking

## 📊 Monitoring & Observability

### Health Endpoints
- `GET /health` - Service health check
- `GET /metrics` - Prometheus metrics for monitoring

### Key Metrics Tracked
- HTTP request duration and count by route/status
- Agent run success/failure rates and execution time
- Queue depth and processing metrics
- Active users by plan
- Usage threshold notifications

## 🔧 Quick Start

### Local Development
```bash
# Install dependencies
npm ci

# Set environment variables
cp .env.example .env
# Edit .env with your values

# Start services
npm start          # API server
npm run worker     # Background worker
```

### Docker Compose
```bash
docker-compose up --build
```

### Deploy to Railway
1. Connect GitHub repository
2. Add Redis and PostgreSQL plugins
3. Set environment variables
4. Deploy automatically on push

## 📋 Environment Variables

### Required
- `REDIS_URL` - Redis connection string
- `DATABASE_URL` - PostgreSQL connection string  
- `JWT_SECRET` - JWT signing secret
- `API_URL` - Public API URL
- `FRONTEND_URL` - Frontend application URL

### Optional
- `PORT` - Server port (default: 4000)
- `STRIPE_SECRET_KEY` - Stripe payments
- `PLATFORM_SENDGRID_API_KEY` - Email notifications
- `PLATFORM_TWILIO_*` - SMS notifications

## 💰 Pricing Tiers

| Plan | Monthly Runs | Emails | SMS | Price |
|------|-------------|--------|-----|-------|
| Free | 200 | 100 | 100 | $0 |
| Starter | 5,000 | 1,000 | 500 | $19 |
| Pro | 50,000 | 10,000 | 5,000 | $49 |
| Scale | 500,000 | 100,000 | 50,000 | $199 |
| Enterprise | Unlimited | Unlimited | Unlimited | Custom |

**Usage alerts automatically sent at 80%, 90%, and 95% of monthly limits.**

## 🔗 API Documentation

Full OpenAPI specification available at `/openapi.yaml`

### Key Endpoints
- `POST /v1/auth/signup` - Create account
- `POST /v1/agents` - Create workflow agent
- `POST /v1/runs` - Execute agent workflow
- `GET /v1/workspace` - Get usage statistics

### Error Responses
Enhanced error handling with detailed context:

```json
// Usage limit exceeded (402)
{
  "error": "run limit reached",
  "current_usage": 195,
  "plan_limit": 200,
  "upgrade_url": "/upgrade"
}

// Input validation (400)
{
  "error": "Input too large (max 50KB)"
}
```

## 🧪 Testing

```bash
# Run integration tests
npm test

# Test against production
API_URL=https://your-api.com npm test
```

Tests include:
- Complete API workflow testing
- Error path validation
- Usage limit enforcement
- Workspace usage tracking

## 🏗️ Architecture

- **Express.js API** - RESTful API with middleware
- **BullMQ Worker** - Background job processing
- **PostgreSQL** - Data persistence with migrations
- **Redis** - Queue management and caching
- **Prometheus** - Metrics collection and monitoring

## 📈 Production Readiness

✅ **Monitoring** - Prometheus metrics and health checks  
✅ **Error Handling** - Comprehensive error responses  
✅ **Usage Tracking** - Proactive limit notifications  
✅ **Rate Limiting** - API protection and abuse prevention  
✅ **Database Migrations** - Schema versioning  
✅ **Integration Tests** - Automated testing pipeline  
✅ **Documentation** - OpenAPI specification  

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details
