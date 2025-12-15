import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testUsageLimits() {
  console.log('🧪 Testing Usage Limits API...');
  
  try {
    // Health check
    const healthRes = await fetch(`${API_URL}/health`);
    if (!healthRes.ok) throw new Error('Health check failed');
    console.log('✅ Health check passed');

    // Create test workspace
    const signupRes = await fetch(`${API_URL}/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'password123'
      })
    });
    
    if (!signupRes.ok) {
      const errorText = await signupRes.text();
      throw new Error(`Signup failed: ${signupRes.status} - ${errorText}`);
    }
    const { api_key } = await signupRes.json();
    console.log('✅ Test workspace created');

    // Test workspace endpoint returns usage info
    const workspaceRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${api_key}` }
    });
    
    if (!workspaceRes.ok) {
      const errorText = await workspaceRes.text();
      throw new Error(`Workspace fetch failed: ${workspaceRes.status} - ${errorText}`);
    }
    const workspace = await workspaceRes.json();
    
    if (typeof workspace.runs_this_month !== 'number') {
      throw new Error('Missing runs_this_month in workspace response');
    }
    if (!workspace.plan) {
      throw new Error('Missing plan in workspace response');
    }
    console.log(`✅ Workspace usage: ${workspace.runs_this_month} runs, plan: ${workspace.plan}`);

    // Create test project first
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({
        name: 'Test Project'
      })
    });
    
    if (!projectRes.ok) {
      const errorText = await projectRes.text();
      throw new Error(`Project creation failed: ${projectRes.status} - ${errorText}`);
    }
    const project = await projectRes.json();
    console.log('✅ Test project created');

    // Create test agent
    const agentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({
        name: 'Test Agent',
        project_id: project.project_id,
        workflow: { 
          nodes: [{ 
            id: '1', 
            type: 'http', 
            config: { url: 'https://httpbin.org/get' } 
          }] 
        }
      })
    });
    
    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      throw new Error(`Agent creation failed: ${agentRes.status} - ${errorText}`);
    }
    const agent = await agentRes.json();
    console.log('✅ Test agent created');

    // Test oversized input (should return 400)
    const largeInput = { data: 'x'.repeat(60000) }; // >50KB
    
    const oversizeRes = await fetch(`${API_URL}/v1/agents/${agent.agent_id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({ input: largeInput })
    });

    if (oversizeRes.status !== 400) {
      const errorText = await oversizeRes.text();
      throw new Error(`Expected 400 for oversized input, got ${oversizeRes.status} - ${errorText}`);
    }
    
    const error = await oversizeRes.json();
    if (error.error !== 'Input too large (max 50KB)') {
      throw new Error(`Wrong error message: ${error.error}`);
    }
    console.log('✅ Oversized input properly rejected');

    // Test normal run (should succeed for free tier)
    const runRes = await fetch(`${API_URL}/v1/agents/${agent.agent_id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api_key}`
      },
      body: JSON.stringify({ input: { test: true } })
    });

    if (runRes.status === 200) {
      const result = await runRes.json();
      if (!result.run_id) throw new Error('Missing run_id in response');
      console.log('✅ Normal run succeeded');
    } else if (runRes.status === 402) {
      const error = await runRes.json();
      console.log(`✅ Usage limit properly enforced: ${error.error}`);
      if (error.current_usage && error.plan_limit) {
        console.log(`   Usage: ${error.current_usage}/${error.plan_limit} runs`);
      }
    } else {
      const errorText = await runRes.text();
      throw new Error(`Run failed: ${runRes.status} - ${errorText}`);
    }

    console.log('🎉 All usage limit tests passed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testUsageLimits();
