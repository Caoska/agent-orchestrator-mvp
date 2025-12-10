# Testing the Agent Orchestrator UI

## Quick Start

### 1. Start the services locally

```bash
# Terminal 1 - Start API server
npm start

# Terminal 2 - Start worker
node worker.js
```

### 2. Run automated test

```bash
# Terminal 3 - Run test script
node test-ui.js
```

This will:
- Create a workspace and get an API key
- Create a project and agent
- Execute a run
- Display the API key to use in the UI

### 3. Test the UI manually

1. Open http://localhost:8080 in your browser
2. Use the API key from the test output to login
3. You should see:
   - Dashboard with stats (agents, runs, schedules, monthly usage)
   - Current plan (free) and upgrade link
   - Quick start cards

### 4. Test Agent Builder

1. Click "Create Agent" button
2. Enter:
   - Agent Name: "Test Agent"
   - Project ID: (use the one from test output)
3. Click "Add Tool"
4. Select tool type (HTTP, Webhook, etc.)
5. Add JSON config, example:
   ```json
   {
     "url": "https://api.github.com/zen",
     "method": "GET"
   }
   ```
6. Click "Create Agent"

### 5. Test Run History

1. Click "View Runs" from dashboard
2. See list of all runs with status badges
3. Click any run to see details:
   - Status, agent, start time, duration
   - Full execution log

### 6. Test Pricing Page

1. Click "Upgrade" link in header
2. View pricing tiers:
   - Free: 200 runs/month
   - Starter: $19/month, 5,000 runs
   - Pro: $99/month, 50,000 runs
   - Enterprise: Contact sales, unlimited

Note: Stripe checkout won't work without STRIPE_SECRET_KEY configured

### 7. Test Usage Limits

To test the limit enforcement:

```bash
# Manually update workspace runs_this_month in database
# Then try to execute a run - should get 402 error
```

## Testing on Railway

1. Push to GitHub (triggers auto-deploy)
2. Get Railway URL from dashboard
3. Run test script against Railway:
   ```bash
   API_URL=https://your-app.railway.app node test-ui.js
   ```
4. Open Railway URL in browser and test UI

## What to Test

- ✅ Login with API key
- ✅ Dashboard shows correct stats
- ✅ Create agent with multiple tools
- ✅ View run history
- ✅ View run details with logs
- ✅ Pricing page displays correctly
- ✅ Plan and usage shown in dashboard
- ✅ Upgrade link works (redirects to pricing)
- ⚠️  Stripe checkout (requires Stripe keys)
- ⚠️  Usage limit enforcement (requires hitting limit)

## Troubleshooting

**"Invalid API key"**
- Make sure you're using the API key from test output
- Check that server is running

**"Agent not found"**
- Use the project_id from test output
- Or create a new project via API first

**Stats show 0**
- Run the test script first to create data
- Refresh the page

**Stripe errors**
- Expected without STRIPE_SECRET_KEY configured
- Add to .env to test checkout flow
