import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://agent-orchestrator-mvp-production.up.railway.app';

async function testUsageMetrics() {
  console.log('🧪 Testing Usage Metrics Tracking...\n');
  
  let apiKey, workspaceId, agentId;
  
  try {
    // 1. Create workspace
    console.log('1️⃣ Creating test workspace...');
    const signupRes = await fetch(`${API_URL}/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: `test-metrics-${Date.now()}@example.com`,
        password: 'test123456'
      })
    });
    
    if (!signupRes.ok) {
      throw new Error(`Signup failed: ${signupRes.status} ${await signupRes.text()}`);
    }
    
    const signupData = await signupRes.json();
    apiKey = signupData.api_key;
    workspaceId = signupData.workspace_id;
    console.log(`✅ Workspace created: ${workspaceId}`);
    
    // 2. Get initial metrics
    console.log('\n2️⃣ Getting initial metrics...');
    const initialRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const initialMetrics = await initialRes.json();
    console.log('Initial metrics:', {
      runs: initialMetrics.runs_this_month,
      steps: initialMetrics.steps_this_month,
      http_calls: initialMetrics.http_calls_this_month,
      execution_seconds: initialMetrics.execution_seconds_this_month
    });
    
    // 3. Create agent with HTTP step
    console.log('\n3️⃣ Creating agent with HTTP step...');
    const agentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Usage Test Agent',
        description: 'Tests usage metrics tracking',
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
    
    const agent = await agentRes.json();
    agentId = agent.agent_id;
    console.log(`✅ Agent created: ${agentId}`);
    
    // 4. Run the agent
    console.log('\n4️⃣ Running agent...');
    const runRes = await fetch(`${API_URL}/v1/agents/${agentId}/run`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: {} })
    });
    
    const runData = await runRes.json();
    console.log(`✅ Run started: ${runData.run_id}`);
    
    // 5. Wait for completion
    console.log('\n5️⃣ Waiting for run completion...');
    let completed = false;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!completed && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const statusRes = await fetch(`${API_URL}/v1/runs/${runData.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const status = await statusRes.json();
      
      console.log(`Status check ${attempts + 1}: ${status.status}`);
      
      if (status.status === 'completed' || status.status === 'failed') {
        completed = true;
        console.log(`✅ Run ${status.status}`);
      }
      attempts++;
    }
    
    if (!completed) {
      throw new Error('Run did not complete within timeout');
    }
    
    // 6. Check updated metrics
    console.log('\n6️⃣ Checking updated metrics...');
    const finalRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const finalMetrics = await finalRes.json();
    
    console.log('Final metrics:', {
      runs: finalMetrics.runs_this_month,
      steps: finalMetrics.steps_this_month,
      http_calls: finalMetrics.http_calls_this_month,
      execution_seconds: finalMetrics.execution_seconds_this_month
    });
    
    // 7. Verify metrics increased
    console.log('\n7️⃣ Verifying metrics increased...');
    const runsIncreased = finalMetrics.runs_this_month > initialMetrics.runs_this_month;
    const stepsIncreased = finalMetrics.steps_this_month > initialMetrics.steps_this_month;
    const httpCallsIncreased = finalMetrics.http_calls_this_month > initialMetrics.http_calls_this_month;
    const executionSecondsIncreased = finalMetrics.execution_seconds_this_month > initialMetrics.execution_seconds_this_month;
    
    console.log('Metrics verification:');
    console.log(`  Runs increased: ${runsIncreased ? '✅' : '❌'} (${initialMetrics.runs_this_month} → ${finalMetrics.runs_this_month})`);
    console.log(`  Steps increased: ${stepsIncreased ? '✅' : '❌'} (${initialMetrics.steps_this_month} → ${finalMetrics.steps_this_month})`);
    console.log(`  HTTP calls increased: ${httpCallsIncreased ? '✅' : '❌'} (${initialMetrics.http_calls_this_month} → ${finalMetrics.http_calls_this_month})`);
    console.log(`  Execution seconds increased: ${executionSecondsIncreased ? '✅' : '❌'} (${initialMetrics.execution_seconds_this_month} → ${finalMetrics.execution_seconds_this_month})`);
    
    const allMetricsWorking = runsIncreased && stepsIncreased && httpCallsIncreased && executionSecondsIncreased;
    
    if (allMetricsWorking) {
      console.log('\n🎉 SUCCESS: All usage metrics are tracking correctly!');
    } else {
      console.log('\n❌ FAILURE: Some usage metrics are not tracking properly');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    // Cleanup
    if (agentId && apiKey) {
      try {
        await fetch(`${API_URL}/v1/agents/${agentId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('✅ Agent cleaned up');
      } catch (e) {
        console.log('⚠️ Failed to cleanup agent:', e.message);
      }
    }
    
    if (workspaceId && apiKey) {
      try {
        await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('✅ Workspace cleaned up');
      } catch (e) {
        console.log('⚠️ Failed to cleanup workspace:', e.message);
      }
    }
  }
}

testUsageMetrics().catch(console.error);
