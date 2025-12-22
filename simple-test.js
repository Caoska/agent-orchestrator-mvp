import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function simpleTest() {
  console.log('🧪 Simple HTTP Test');
  
  // Create workspace
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      name: 'Simple Test', 
      owner_email: `simple-${Date.now()}@example.com` 
    })
  }).then(r => r.json());
  
  // Create project
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ws.api_key}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: 'Simple Test' })
  }).then(r => r.json());
  
  // Create simple agent with reliable endpoint
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: 'Simple Agent',
      steps: [
        { type: 'http', config: { url: 'https://httpbin.org/json', method: 'GET' } }
      ]
    })
  }).then(r => r.json());
  
  console.log('✓ Agent created:', agent.agent_id);
  
  // Run agent
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent.agent_id, input: {} })
  }).then(r => r.json());
  
  console.log('✓ Run created:', run.run_id);
  
  // Wait for completion
  let status;
  let attempts = 0;
  do {
    await new Promise(r => setTimeout(r, 1000));
    status = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { 'Authorization': `Bearer ${ws.api_key}` }
    }).then(r => r.json());
    console.log(`Attempt ${++attempts}: ${status.status}`);
  } while (status.status === 'running' && attempts < 30);
  
  console.log('Final status:', status.status);
  if (status.error) console.log('Error:', status.error);
  
  // Cleanup
  await fetch(`${API_URL}/v1/workspaces/${ws.workspace_id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${ws.api_key}` }
  });
  
  return status.status === 'completed';
}

simpleTest().then(success => {
  console.log(success ? '✅ Test passed' : '❌ Test failed');
}).catch(console.error);
