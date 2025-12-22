import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function quickTest() {
  console.log('🧪 Quick Usage Metrics Test...\n');
  
  let apiKey, workspaceId, projectId, agentId;
  
  try {
    // 1. Create workspace (like the working tests do)
    console.log('1️⃣ Creating workspace...');
    const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usage Test Workspace',
        owner_email: `test-${Date.now()}@example.com`
      })
    });
    
    const workspaceData = await workspaceRes.json();
    console.log('Workspace response:', workspaceData);
    
    apiKey = workspaceData.api_key;
    workspaceId = workspaceData.workspace_id;
    
    // 2. Get initial workspace metrics
    console.log('\n2️⃣ Getting initial metrics...');
    const wsRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const wsData = await wsRes.json();
    console.log('Initial metrics:', {
      runs: wsData.runs_this_month,
      steps: wsData.steps_this_month,
      http_calls: wsData.http_calls_this_month,
      execution_seconds: wsData.execution_seconds_this_month
    });
    
    // 3. Create project
    console.log('\n3️⃣ Creating project...');
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Test Project',
        workspace_id: workspaceId
      })
    });
    
    const projectData = await projectRes.json();
    console.log('Project response:', projectData);
    projectId = projectData.project_id;
    
    // 4. Create agent
    console.log('\n4️⃣ Creating agent...');
    const agentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        project_id: projectId,
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
    agentId = agentData.agent_id;
    
    // Verify agent exists
    console.log('\n4.1️⃣ Verifying agent exists...');
    const verifyRes = await fetch(`${API_URL}/v1/agents/${agentId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const verifyData = await verifyRes.json();
    console.log('Agent verification:', verifyData.agent_id ? 'EXISTS' : 'NOT FOUND');
    
    // 5. Run agent
    console.log('\n5️⃣ Running agent...');
    const runRes = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ 
        agent_id: agentId,
        input: {} 
      })
    });
    
    console.log('Run response status:', runRes.status);
    const runText = await runRes.text();
    console.log('Run response text:', runText);
    
    let runData;
    try {
      runData = JSON.parse(runText);
    } catch (e) {
      throw new Error(`Failed to parse run response: ${runText}`);
    }
    
    console.log('Run response:', runData);
    
    if (!runData.run_id) {
      throw new Error('No run_id in response');
    }
    
    console.log('Run started:', runData.run_id);
    
    // 6. Wait for completion and check metrics
    console.log('\n6️⃣ Waiting for completion...');
    let attempts = 0;
    let completed = false;
    
    while (!completed && attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusRes = await fetch(`${API_URL}/v1/runs/${runData.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const status = await statusRes.json();
      
      console.log(`  Status: ${status.status}`);
      if (status.status === 'failed') {
        console.log(`  Error: ${status.error}`);
      }
      
      if (status.status === 'completed' || status.status === 'failed') {
        completed = true;
      }
      attempts++;
    }
    
    // 7. Check final metrics
    console.log('\n7️⃣ Checking final metrics...');
    const finalWsRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const finalWsData = await finalWsRes.json();
    
    console.log('\n📊 Final Metrics:');
    console.log(`  runs_this_month: ${finalWsData.runs_this_month}`);
    console.log(`  steps_this_month: ${finalWsData.steps_this_month}`);
    console.log(`  http_calls_this_month: ${finalWsData.http_calls_this_month}`);
    console.log(`  execution_seconds_this_month: ${finalWsData.execution_seconds_this_month}`);
    
    // Verify metrics increased
    const success = finalWsData.runs_this_month > 0 && 
                   finalWsData.steps_this_month > 0 && 
                   finalWsData.http_calls_this_month > 0;
    
    if (success) {
      console.log('\n🎉 SUCCESS: Usage metrics are working!');
    } else {
      console.log('\n❌ FAILURE: Usage metrics not incrementing');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup
    if (workspaceId && apiKey) {
      try {
        await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('\n✅ Cleanup complete');
      } catch (e) {
        console.log('⚠️ Failed to cleanup workspace:', e.message);
      }
    }
  }
}

quickTest().catch(console.error);
