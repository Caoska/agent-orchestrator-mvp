import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:4000';
let apiKey = null;
let workspaceId = null;
let projectId = null;
let agentIds = {};
let runIds = [];

const testEmail = `test-${Date.now()}@example.com`;
const testPassword = 'testpass123';

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
  const data = await apiCall('POST', '/v1/projects', { name: 'Test Project' });
  if (!data.project_id) throw new Error('No project ID');
  projectId = data.project_id;
});

// Template Tests
await test('List templates', async () => {
  const data = await apiCall('GET', '/v1/templates');
  if (!Array.isArray(data)) throw new Error('Not an array');
  if (data.length === 0) throw new Error('No templates');
});

await test('Get template', async () => {
  const data = await apiCall('GET', '/v1/templates/lead-capture');
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
await test('Create schedule', async () => {
  const data = await apiCall('POST', '/v1/schedules', {
    agent_id: agentIds.http,
    cron: '0 0 * * *',
    input: { scheduled: true }
  });
  if (!data.schedule_id) throw new Error('No schedule ID');
  scheduleId = data.schedule_id;
});

await test('List schedules', async () => {
  const data = await apiCall('GET', '/v1/schedules');
  if (!Array.isArray(data)) throw new Error('Not an array');
});

await test('Delete schedule', async () => {
  await apiCall('DELETE', `/v1/schedules/${scheduleId}`);
});

// Cleanup
await test('Delete agent', async () => {
  await apiCall('DELETE', `/v1/agents/${agentIds.http}`);
});

await test('Delete workspace', async () => {
  await apiCall('DELETE', '/v1/workspace');
});

console.log('\n🎉 All tests passed!');
