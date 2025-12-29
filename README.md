# SiloWorker - Reliable Backend Job Processing

> **Send a follow-up email 30 minutes after checkout — exactly once — even if your servers restart.**

SiloWorker handles delayed jobs, retries, and long-running tasks without you building your own worker system. If you've outgrown cron jobs, background tasks, or Zapier, SiloWorker runs your jobs reliably and resumes exactly where they failed.

[![API Documentation](https://img.shields.io/badge/API-Documentation-blue)](https://api.siloworker.dev/docs)
[![Features](https://img.shields.io/badge/Features-Examples-green)](https://siloworker.dev/features)
[![Pricing Calculator](https://img.shields.io/badge/BYOC-Savings%20Calculator-orange)](https://siloworker.dev/pricing-calculator)

## 🎯 Why SiloWorker vs Zapier?

| Feature | Zapier | SiloWorker |
|---------|--------|------------|
| **Database Access** | ❌ No direct queries | ✅ Full SQL support (PostgreSQL, MySQL, SQLite) |
| **Parallel Execution** | ❌ Sequential only | ✅ True fork/join parallel processing |
| **Conditional Logic** | ❌ Basic if/then only | ✅ Complex multi-condition logic with AND/OR |
| **Email Cost** | ❌ $0.002/email + overages | ✅ BYOC: Use your SendGrid key = $0 |
| **SMS Cost** | ❌ $0.05/SMS + overages | ✅ BYOC: Use your Twilio rates |
| **API Access** | ❌ Limited, GUI-focused | ✅ API-first with full OpenAPI spec |
| **Version Control** | ❌ No git integration | ✅ JSON configs, git-friendly |

**Real Savings Example:** 10K emails + 1K SMS monthly = **Save $75/month (80%)** with BYOC

## ⚡ Parallel Processing

SiloWorker executes workflow steps in parallel when possible, dramatically reducing execution time:

```
Sequential (Zapier):     Parallel (SiloWorker):
Step 1: API call (2s)    Step 1: API call (2s)
Step 2: Email (1s)       ├─ Step 2: Email (1s)      ⚡
Step 3: SMS (1s)         ├─ Step 3: SMS (1s)        ⚡  
Step 4: Database (0.5s)  └─ Step 4: Database (0.5s) ⚡
Total: 4.5s              Total: 3s (33% faster)
```

**Visual Indicators:** Orange dashed connections show parallel execution in the UI

### 🔄 Automatic Join Coordination
When multiple parallel branches converge to a single step, SiloWorker automatically waits for ALL branches to complete before proceeding - no configuration required.

```
Fork Pattern with Auto-Join:
HTTP ══╤══ Transform A ══╗
       ║                 ║
       ╠══ Transform B ══╬══ [AUTO-JOIN] ══ Email
       ║                 ║
       ╚══ Database ═════╝

✓ Email step waits for Transform A, Transform B, AND Database to ALL finish
✓ Uses Promise.all() coordination under the hood
✓ Zero configuration - just connect the nodes
```

## 🔄 Resume from Failure

Unlike other platforms, SiloWorker can resume failed workflows from the exact point of failure:

```bash
# Resume a failed run from where it stopped
curl -X POST https://api.siloworker.dev/v1/runs/run_123/resume \
  -H "Authorization: Bearer sk_live_your_api_key"

# Resume from a specific step (useful if dependencies need re-execution)
curl -X POST https://api.siloworker.dev/v1/runs/run_123/resume \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -d '{"from_step": "step_14"}'

# Bulk resume all failed runs for an agent
curl -X POST https://api.siloworker.dev/v1/runs/bulk-resume \
  -H "Authorization: Bearer sk_live_your_api_key" \
  -d '{"agent_id": "agent_456"}'
```

**Example**: 16-step workflow fails at step 15
- Steps 1-14: ✅ Completed (outputs preserved)
- Step 15: ❌ Failed → Resume skips 1-14, re-runs 15-16
- **Result**: No wasted computation, fast recovery

## 🛠️ 9 Built-in Tools

### 🌐 HTTP Tool
Make authenticated API calls with full header support
```json
{
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": {"Authorization": "Bearer {{token}}"},
  "body": {"name": "{{user.name}}", "email": "{{user.email}}"}
}
```

### 🗄️ Database Tool
Direct SQL queries to your databases
```sql
SELECT u.*, p.plan_name 
FROM users u 
JOIN plans p ON u.plan_id = p.id 
WHERE u.last_login < NOW() - INTERVAL '30 days'
AND p.plan_name != 'free'
ORDER BY u.created_at DESC
```

### 📧 SendGrid Tool
Send templated emails with dynamic data
```json
{
  "to": "{{user.email}}",
  "template_id": "d-abc123",
  "dynamic_template_data": {
    "name": "{{user.name}}",
    "plan": "{{user.plan}}",
    "usage": "{{user.current_usage}}"
  }
}
```

### 📱 Twilio Tool
Send SMS with your own Twilio credentials
```json
{
  "to": "{{user.phone}}",
  "body": "Hi {{user.name}}, your order #{{order.id}} has shipped! Track: {{order.tracking_url}}",
  "from": "+1234567890"
}
```

### 🤖 LLM Tool
Integrate OpenAI, Anthropic, or local models
```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "Summarize customer feedback professionally"},
    {"role": "user", "content": "{{feedback.text}}"}
  ],
  "max_tokens": 150
}
```

### ❓ Conditional Tool
Complex logic that Zapier can't handle
```javascript
// Multi-condition logic
IF (user.plan === 'enterprise' AND user.usage > 10000) 
OR (user.support_tickets > 5 AND user.plan !== 'free')
OR (user.last_payment_failed === true)
THEN send_priority_alert
ELSE log_standard_metrics
```

### 🔄 Transform Tool
JavaScript data transformation
```javascript
const result = {
  fullName: `${input.firstName} ${input.lastName}`.trim(),
  email: input.email.toLowerCase(),
  phone: input.phone.replace(/\D/g, ''),
  signupDate: new Date().toISOString(),
  plan: input.plan || 'free'
};
```

### 🔗 Webhook Tool & ⏱️ Delay Tool
Receive webhooks and schedule delays for complete workflow control.

## 🔥 Real-World Examples

### Example 1: User Onboarding with Database Check
```javascript
// 1. Webhook: New user signup
// 2. Database: Check existing user and preferences
SELECT * FROM users WHERE email = '{{input.email}}'
UNION
SELECT preferences FROM user_preferences WHERE user_id = {{user.id}}

// 3. Conditional: Personalized onboarding path
IF user.exists AND user.preferences.enterprise_features
THEN send_enterprise_welcome
ELSE send_standard_welcome

// 4. SendGrid: Send personalized email
{
  "template_id": "{{user.template}}",
  "dynamic_template_data": {
    "name": "{{user.name}}",
    "features": "{{user.available_features}}"
  }
}
```

### Example 2: E-commerce Order Processing
```javascript
// 1. Webhook: Order received
// 2. Database: Get customer tier and history
SELECT customer_tier, total_orders, last_order_date 
FROM customers WHERE id = {{order.customer_id}}

// 3. Conditional: VIP processing logic
IF (order.amount > 100 AND customer.tier = 'VIP') 
OR (customer.total_orders > 50)
OR (order.items.includes('priority_shipping'))
THEN priority_processing_workflow
ELSE standard_processing_workflow

// 4. Multiple parallel actions based on conditions
// - Update inventory
// - Send confirmation email
// - Notify fulfillment center
// - Update customer analytics
```

### Example 3: Customer Support Automation
```javascript
// 1. Webhook: Support ticket created
// 2. LLM: Analyze ticket sentiment and category
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "Categorize support ticket: billing, technical, or general. Rate urgency 1-5."},
    {"role": "user", "content": "{{ticket.description}}"}
  ]
}

// 3. Database: Check customer history
SELECT plan, support_tickets_count, last_response_rating 
FROM customers WHERE email = '{{ticket.email}}'

// 4. Conditional: Route based on analysis
IF llm.urgency >= 4 OR customer.plan = 'enterprise'
THEN assign_to_senior_support
ELSE assign_to_standard_queue

// 5. Twilio: SMS notification for urgent tickets
```

## 💰 BYOC Pricing Advantage

**Bring Your Own Credentials = Massive Savings**

| Monthly Usage | Zapier Cost | SiloWorker + BYOC | Savings |
|---------------|-------------|-------------------|---------|
| 5K runs, 2K emails, 500 SMS | $94 | $19 | **$75 (80%)** |
| 20K runs, 10K emails, 2K SMS | $199 | $49 | **$150 (75%)** |
| 100K runs, 50K emails, 10K SMS | $599 | $199 | **$400 (67%)** |

[**Calculate Your Savings →**](https://agent-orchestrator-mvp-production.up.railway.app/pricing-calculator)

## 🚀 Quick Start

### Option 1: Web Interface
1. **[Sign up at siloworker.dev](https://siloworker.dev)** - Visual workflow builder
2. **Create workflows** - Drag-and-drop interface  
3. **Monitor runs** - Real-time dashboard

### Option 2: CLI (Power Users)
```bash
# Install CLI
npm install -g siloworker-cli

# Authenticate
siloworker auth login

# Create project
siloworker project create -n "My Project"

# Create agent from config file
siloworker agent create -n "User Onboarding" -f workflow.json

# Run workflow
siloworker run start agent_xxx -d '{"email": "new@user.com"}'

# Monitor status
siloworker run status run_xxx

# Bulk operations
siloworker run resume-all-failed
```

### Option 3: Direct API
```bash
curl -X POST https://api.siloworker.dev/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "you@company.com", "password": "secure123"}'
```

## 🔧 Local Development

```bash
# Clone repository
git clone https://github.com/Caoska/agent-orchestrator-mvp.git
cd agent-orchestrator-mvp

# Install dependencies
npm ci

# Set environment variables
cp .env.example .env
# Edit .env with your values

# Start services
npm start          # API server
npm run worker     # Background worker

# Run tests
npm test
```

## 📋 Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string  
- `JWT_SECRET` - JWT signing secret
- `API_URL` - Public API URL
- `FRONTEND_URL` - Frontend application URL

### Optional BYOC Credentials
- `PLATFORM_SENDGRID_API_KEY` - For email workflows
- `PLATFORM_TWILIO_ACCOUNT_SID` - For SMS workflows
- `PLATFORM_TWILIO_AUTH_TOKEN` - For SMS workflows
- `STRIPE_SECRET_KEY` - For payment processing

## 🏗️ Architecture

- **Express.js API** - RESTful API with comprehensive middleware
- **BullMQ Worker** - Background job processing with Redis
- **PostgreSQL** - Data persistence with automated migrations
- **Prometheus Metrics** - Production monitoring and alerting
- **OpenAPI Spec** - Complete API documentation

## 📊 Production Features

✅ **Monitoring** - Prometheus metrics, health checks, correlation IDs  
✅ **Error Handling** - Detailed error responses with usage context  
✅ **Usage Tracking** - Proactive notifications at 80%, 90%, 95% limits  
✅ **Rate Limiting** - API protection and abuse prevention  
✅ **Database Migrations** - Automated schema versioning  
✅ **Integration Tests** - Comprehensive test coverage  
✅ **BYOC Support** - Bring your own SendGrid, Twilio, OpenAI keys  

## 🔗 Resources

- 📖 **[API Documentation](https://api.siloworker.dev/docs)** - Interactive Swagger UI
- ⚡ **[CLI Documentation](https://siloworker.dev/cli)** - Command-line interface for power users
- 🌟 **[Features & Examples](https://siloworker.dev/features)** - See all 9 tools in action
- 🔄 **[Migration Guide](https://siloworker.dev/migrate-from-zapier)** - Step-by-step Zapier migration
- 💰 **[Pricing Calculator](https://siloworker.dev/pricing-calculator)** - Calculate BYOC savings
- 💵 **[Pricing](https://siloworker.dev/pricing)** - Transparent pricing tiers
- 🚀 **[Try SiloWorker](https://siloworker.dev)** - Get started with free account

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Add tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Commit changes (`git commit -m 'feat: add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

**Ready to save 80% on automation costs?** [Start your free trial →](https://siloworker.dev)
