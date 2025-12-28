import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testNewEndpoints() {
  console.log('🧪 Testing New API Endpoints\n');
  
  try {
    // Test 1: List Tools
    console.log('1. Testing GET /v1/tools...');
    const toolsResponse = await fetch(`${API_URL}/v1/tools`);
    const toolsData = await toolsResponse.json();
    
    if (toolsResponse.ok && toolsData.tools && Array.isArray(toolsData.tools)) {
      console.log(`✅ Tools endpoint works - found ${toolsData.tools.length} tools`);
      console.log(`   Tools: ${toolsData.tools.map(t => t.type).join(', ')}`);
    } else {
      console.log('❌ Tools endpoint failed');
      return false;
    }
    
    // Test 2: List Triggers
    console.log('\n2. Testing GET /v1/triggers...');
    const triggersResponse = await fetch(`${API_URL}/v1/triggers`);
    const triggersData = await triggersResponse.json();
    
    if (triggersResponse.ok && triggersData.triggers && Array.isArray(triggersData.triggers)) {
      console.log(`✅ Triggers endpoint works - found ${triggersData.triggers.length} triggers`);
      console.log(`   Triggers: ${triggersData.triggers.map(t => t.type).join(', ')}`);
    } else {
      console.log('❌ Triggers endpoint failed');
      return false;
    }
    
    // Test 3: Create test user and agent for resume tests
    console.log('\n3. Setting up test data for resume tests...');
    const testEmail = `test-resume-${Date.now()}@example.com`;
    
    // Signup
    const signupResponse = await fetch(`${API_URL}/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: testEmail,
        password: 'testpass123'
      })
    });
    
    if (!signupResponse.ok) {
      console.log('❌ Failed to create test user');
      return false;
    }
    
    // Login to get API key
    const loginResponse = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'testpass123'
      })
    });
    
    const loginData = await loginResponse.json();
    if (!loginResponse.ok || !loginData.api_key) {
      console.log('❌ Failed to login test user');
      return false;
    }
    
    const apiKey = loginData.api_key;
    console.log('✅ Test user created and logged in');
    
    // Create a project first
    const projectResponse = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Resume Test Project'
      })
    });
    
    const projectData = await projectResponse.json();
    if (!projectResponse.ok || !projectData.project_id) {
      console.log('❌ Failed to create test project');
      console.log('Response:', projectData);
      return false;
    }
    
    const projectId = projectData.project_id;
    console.log('✅ Test project created');
    
    // Create a test agent that will fail
    console.log('\n4. Creating test agent with failing step...');
    const agentResponse = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        project_id: projectId,
        name: 'Resume Test Agent',
        nodes: [
          {
            id: 'step1',
            type: 'transform',
            config: {
              name: 'Success Step',
              code: 'return { success: true, step: 1 };'
            }
          },
          {
            id: 'step2',
            type: 'transform',
            config: {
              name: 'Failing Step',
              code: 'throw new Error("Intentional test failure");'
            }
          },
          {
            id: 'step3',
            type: 'transform',
            config: {
              name: 'Never Executed',
              code: 'return { success: true, step: 3 };'
            }
          }
        ],
        connections: [
          { from: 'step1', to: 'step2' },
          { from: 'step2', to: 'step3' }
        ]
      })
    });
    
    const agentData = await agentResponse.json();
    if (!agentResponse.ok || !agentData.agent_id) {
      console.log('❌ Failed to create test agent');
      console.log('Response:', agentData);
      return false;
    }
    
    const agentId = agentData.agent_id;
    console.log(`✅ Test agent created: ${agentId}`);
    
    // Run the agent to create a failed run
    console.log('\n5. Running agent to create failed run...');
    const runResponse = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: agentId,
        project_id: projectId,
        input: { test: true },
        run_async: false
      })
    });
    
    const runData = await runResponse.json();
    if (!runResponse.ok || !runData.run_id) {
      console.log('❌ Failed to create test run');
      console.log('Response:', runData);
      return false;
    }
    
    const runId = runData.run_id;
    console.log(`✅ Test run created: ${runId}`);
    
    // Wait for run to complete (and fail)
    console.log('\n6. Waiting for run to fail...');
    let runStatus = 'running';
    let attempts = 0;
    
    while (runStatus === 'running' && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const statusResponse = await fetch(`${API_URL}/v1/runs/${runId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      attempts++;
    }
    
    if (runStatus !== 'failed') {
      console.log(`❌ Run didn't fail as expected, status: ${runStatus}`);
      return false;
    }
    
    console.log('✅ Run failed as expected');
    
    // Test 4: Resume failed run
    console.log('\n7. Testing POST /v1/runs/:id/resume...');
    const resumeResponse = await fetch(`${API_URL}/v1/runs/${runId}/resume`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const resumeData = await resumeResponse.json();
    if (resumeResponse.ok && resumeData.run_id && resumeData.original_run_id === runId) {
      console.log(`✅ Resume endpoint works - new run: ${resumeData.run_id}`);
    } else {
      console.log('❌ Resume endpoint failed');
      console.log('Response:', resumeData);
      return false;
    }
    
    // Test 5: Bulk resume
    console.log('\n8. Testing POST /v1/runs/bulk-resume...');
    const bulkResumeResponse = await fetch(`${API_URL}/v1/runs/bulk-resume`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: agentId,
        status_filter: 'failed'
      })
    });
    
    const bulkResumeData = await bulkResumeResponse.json();
    if (bulkResumeResponse.ok && typeof bulkResumeData.resumed_count === 'number') {
      console.log(`✅ Bulk resume endpoint works - resumed ${bulkResumeData.resumed_count} runs`);
    } else {
      console.log('❌ Bulk resume endpoint failed');
      console.log('Response:', bulkResumeData);
      return false;
    }
    
    console.log('\n🎉 All new endpoint tests passed!');
    return true;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  }
}

// Run the test
testNewEndpoints().then(success => {
  process.exit(success ? 0 : 1);
});
