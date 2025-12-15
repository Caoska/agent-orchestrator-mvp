import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:4000';
let apiKey = null;
let workspaceId = null;
let projectId = null;
let agentIds = {};
let runIds = [];

const testEmail = `test-${Date.now()}@example.com`;
const testPassword = 'testpass123';

// Cleanup on exit (even if tests fail)
process.on('beforeExit', async () => {
  if (apiKey) {
    try {
      await apiCall('DELETE', '/v1/workspace');
      console.log('\n🧹 Cleaned up test workspace');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
});

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
  } catch (err) {
    console.error(`❌ ${name}`);
    console.error(`   ${err.message}`);
    process.exit(1);
  }
}

async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  
  return res.json();
}

// Auth Tests
await test('Health check', async () => {
  const data = await apiCall('GET', '/health');
  if (!data.ok) throw new Error('Health check failed');
});

await test('Signup', async () => {
  const data = await apiCall('POST', '/v1/auth/signup', {
    name: 'Test User',
    email: testEmail,
    password: testPassword
  });
  apiKey = data.apiKey;
  workspaceId = data.workspace_id;
  if (!apiKey) throw new Error('No API key returned');
  
  // If verification required, manually verify via database (test only)
  if (data.requiresVerification) {
    console.log('   ⚠️  Email verification required - skipping verification for test');
    // In production, account would need email verification
    // For testing, we'll continue with unverified account
  }
});

await test('Login', async () => {
  const data = await apiCall('POST', '/v1/auth/login', {
    email: testEmail,
    password: testPassword
  });
  if (!data.token) throw new Error('No token returned');
});

// Workspace Tests
await test('Get workspace', async () => {
  const data = await apiCall('GET', '/v1/workspace');
  if (data.workspace_id !== workspaceId) throw new Error('Wrong workspace');
});

// Project Tests
await test('List projects', async () => {
  const data = await apiCall('GET', '/v1/projects');
  if (!Array.isArray(data)) throw new Error('Not an array');
  projectId = data[0]?.project_id;
});

await test('Create project', async () => {
  const data = await apiCall('POST', '/v1/projects', { 
    workspace_id: workspaceId,
    name: 'Test Project' 
  });
  if (!data.project_id) throw new Error('No project ID');
  projectId = data.project_id;
});

// Template Tests
let templateId = null;
await test('List templates', async () => {
  const data = await apiCall('GET', '/v1/templates');
  if (!Array.isArray(data)) throw new Error('Not an array');
  if (data.length === 0) throw new Error('No templates');
  templateId = data[0].id; // Use first template
});

await test('Get template', async () => {
  const data = await apiCall('GET', `/v1/templates/${templateId}`);
  if (!data.steps) throw new Error('No steps in template');
});

// Tool Tests - Create agent for each tool type
const tools = [
  {
    name: 'HTTP Tool',
    type: 'http',
    config: { url: 'https://httpbin.org/get', method: 'GET' }
  },
  {
    name: 'Webhook Tool',
    type: 'webhook',
    config: { url: 'https://webhook.site/unique-id', method: 'POST', body: { test: true } }
  },
  {
    name: 'Delay Tool',
    type: 'delay',
    config: { seconds: 1 }
  },
  {
    name: 'Transform Tool',
    type: 'transform',
    config: { operations: [{ type: 'template', key: 'result', template: 'Test: {{input.value}}' }] }
  },
  {
    name: 'Conditional Tool',
    type: 'conditional',
    config: { condition: 'true' }
  },
  {
    name: 'Database Tool',
    type: 'database',
    config: { query: 'SELECT 1 as test', connection_string: 'postgresql://test:test@localhost:5432/test' }
  },
  {
    name: 'SendGrid Tool',
    type: 'sendgrid',
    config: { to: 'test@example.com', subject: 'Test', text: 'Test email' }
  },
  {
    name: 'LLM Tool',
    type: 'llm',
    config: { prompt: 'Say hello', model: 'gpt-4' }
  },
  {
    name: 'Twilio Tool',
    type: 'twilio',
    config: { to: '+15555555555', from: '+15555555555', body: 'Test SMS' }
  }
];

for (const tool of tools) {
  await test(`Create agent with ${tool.name}`, async () => {
    const data = await apiCall('POST', '/v1/agents', {
      project_id: projectId,
      name: tool.name,
      steps: [{ type: tool.type, config: tool.config }]
    });
    if (!data.agent_id) throw new Error('No agent ID');
    agentIds[tool.type] = data.agent_id;
  });
}

// Agent CRUD Tests
await test('List agents', async () => {
  const data = await apiCall('GET', '/v1/agents');
  if (!Array.isArray(data)) throw new Error('Not an array');
  if (data.length === 0) throw new Error('No agents');
});

await test('Get agent', async () => {
  const data = await apiCall('GET', `/v1/agents/${agentIds.http}`);
  if (!data.steps) throw new Error('No steps');
});

await test('Update agent', async () => {
  await apiCall('PUT', `/v1/agents/${agentIds.http}`, {
    name: 'Updated HTTP Tool',
    steps: [{ type: 'http', config: { url: 'https://httpbin.org/post', method: 'POST' } }]
  });
});

// Run Tests
await test('Create run', async () => {
  const data = await apiCall('POST', '/v1/runs', {
    agent_id: agentIds.http,
    project_id: projectId,
    input: { test: 'value' }
  });
  if (!data.run_id) throw new Error('No run ID');
  runIds.push(data.run_id);
});

await test('List runs', async () => {
  const data = await apiCall('GET', '/v1/runs');
  if (!Array.isArray(data)) throw new Error('Not an array');
});

await test('Get run', async () => {
  // Wait a bit for run to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
  const data = await apiCall('GET', `/v1/runs/${runIds[0]}`);
  if (!data.status) throw new Error('No status');
});

// Schedule Tests
let scheduleId = null;
await test('Create schedule (cron)', async () => {
  const data = await apiCall('POST', '/v1/schedules', {
    agent_id: agentIds.http,
    cron: '0 0 * * *',
    input: { scheduled: true }
  });
  if (!data.schedule_id) throw new Error('No schedule ID');
  scheduleId = data.schedule_id;
});

await test('Create schedule (interval)', async () => {
  const data = await apiCall('POST', '/v1/schedules', {
    agent_id: agentIds.delay,
    interval_seconds: 3600,
    input: { interval: true }
  });
  if (!data.schedule_id) throw new Error('No schedule ID');
});

await test('List schedules', async () => {
  const data = await apiCall('GET', '/v1/schedules');
  if (!Array.isArray(data.schedules)) throw new Error('Not an array');
});

await test('Delete schedule', async () => {
  await apiCall('DELETE', `/v1/schedules/${scheduleId}`);
});

// Template Tests - Create agents from all templates
await test('List all templates', async () => {
  const data = await apiCall('GET', '/v1/templates');
  if (!Array.isArray(data)) throw new Error('Not an array');
  if (data.length < 10) throw new Error(`Expected 10 templates, got ${data.length}`);
});

const templates = await apiCall('GET', '/v1/templates');
for (const template of templates) {
  await test(`Create agent from template: ${template.name}`, async () => {
    const data = await apiCall('POST', '/v1/agents', {
      project_id: projectId,
      name: `From Template: ${template.name}`,
      steps: template.steps
    });
    if (!data.agent_id) throw new Error('No agent ID');
  });
}

// Error path tests (before cleanup)
await test('Test oversized input (400 error)', async () => {
  const largeInput = { data: 'x'.repeat(60000) }; // >50KB
  
  const res = await fetch(`${API_URL}/v1/agents/${agentIds.http}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ input: largeInput })
  });

  if (res.status !== 400) {
    throw new Error(`Expected 400 for oversized input, got ${res.status}`);
  }
  
  const error = await res.json();
  if (error.error !== 'Input too large (max 50KB)') {
    throw new Error(`Wrong error message: ${error.error}`);
  }
});

await test('Test workspace usage tracking', async () => {
  const res = await fetch(`${API_URL}/v1/workspace`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  
  if (!res.ok) throw new Error(`Workspace fetch failed: ${res.status}`);
  const workspace = await res.json();
  
  if (typeof workspace.runs_this_month !== 'number') {
    throw new Error('Missing runs_this_month in workspace response');
  }
  if (!workspace.plan) {
    throw new Error('Missing plan in workspace response');
  }
  console.log(`   Usage: ${workspace.runs_this_month} runs, plan: ${workspace.plan}`);
});

// Cleanup
await test('Delete agent', async () => {
  await apiCall('DELETE', `/v1/agents/${agentIds.http}`);
});

await test('Delete workspace', async () => {
  await apiCall('DELETE', '/v1/workspace');
});

console.log('\n🎉 All tests passed!');
