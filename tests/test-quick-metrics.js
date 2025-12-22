import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function quickTest() {
  console.log('🧪 Quick Usage Metrics Test...\n');
  
  try {
    // 1. Create workspace
    console.log('1️⃣ Creating workspace...');
    const signupRes = await fetch(`${API_URL}/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: `test-${Date.now()}@example.com`,
        password: 'test123456'
      })
    });
    
    const signupData = await signupRes.json();
    console.log('Signup response:', signupData);
    
    if (!signupData.apiKey) {
      throw new Error('No API key in signup response');
    }
    
    const apiKey = signupData.apiKey;
    const workspaceId = signupData.workspace_id;
    
    // 2. Get workspace info
    console.log('\n2️⃣ Getting workspace info...');
    const wsRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const wsData = await wsRes.json();
    console.log('Workspace data:', JSON.stringify(wsData, null, 2));
    
    // 3. Create project first
    console.log('\n3️⃣ Creating project...');
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Project'
      })
    });
    
    const projectData = await projectRes.json();
    console.log('Project response:', projectData);
    
    if (!projectData.project_id) {
      throw new Error('No project_id in response');
    }
    
    console.log('Project created:', projectData.project_id);
    
    // 4. Create agent
    console.log('\n4️⃣ Creating agent...');
    const agentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        project_id: projectData.project_id,
        name: 'Test Agent',
        steps: [
          {
            id: 'step1',
            type: 'http',
            config: {
              url: 'https://httpbin.org/json',
              method: 'GET'
            }
          }
        ]
      })
    });
    
    const agentData = await agentRes.json();
    console.log('Agent response:', agentData);
    
    if (!agentData.agent_id) {
      throw new Error('No agent_id in response');
    }
    
    console.log('Agent created:', agentData.agent_id);
    
    // 5. Run agent
    console.log('\n5️⃣ Running agent...');
    const runRes = await fetch(`${API_URL}/v1/agents/${agentData.agent_id}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: {} })
    });
    
    const runData = await runRes.json();
    console.log('Run started:', runData.run_id);
    
    // 6. Wait and check final metrics
    console.log('\n6️⃣ Waiting 30 seconds then checking metrics...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    const finalWsRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const finalWsData = await finalWsRes.json();
    
    console.log('\n📊 Final Metrics:');
    console.log(`  runs_this_month: ${finalWsData.runs_this_month}`);
    console.log(`  steps_this_month: ${finalWsData.steps_this_month}`);
    console.log(`  http_calls_this_month: ${finalWsData.http_calls_this_month}`);
    console.log(`  execution_seconds_this_month: ${finalWsData.execution_seconds_this_month}`);
    
    // Cleanup
    await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    console.log('\n✅ Cleanup complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

quickTest().catch(console.error);
