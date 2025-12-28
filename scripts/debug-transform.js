import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  
  if (apiKey) {
    options.headers.Authorization = `Bearer ${apiKey}`;
  }
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    const error = await res.text();
    throw new Error(`${res.status}: ${error}`);
  }
  return await res.json();
}

let apiKey = null;

async function testTransform() {
  try {
    // Quick signup/login
    const testEmail = `test-${Date.now()}@example.com`;
    await apiCall('POST', '/v1/auth/signup', {
      email: testEmail,
      password: 'testpass123',
      name: 'Test User'
    });
    
    const loginResult = await apiCall('POST', '/v1/auth/login', {
      email: testEmail,
      password: 'testpass123'
    });
    apiKey = loginResult.api_key;
    
    const projects = await apiCall('GET', '/v1/projects');
    const projectId = projects[0].project_id;
    
    // Get Daily Market Report template
    const templates = await apiCall('GET', '/v1/templates');
    const template = templates.find(t => t.id === 'daily-market-report');
    
    console.log('Template transform step:', JSON.stringify(template.steps[3], null, 2));
    
    // Create and run agent
    const agent = await apiCall('POST', '/v1/agents', {
      project_id: projectId,
      name: 'Transform Debug',
      steps: template.steps
    });
    
    const run = await apiCall('POST', '/v1/runs', {
      agent_id: agent.agent_id,
      project_id: projectId,
      input: {}
    });
    
    // Wait for completion
    let attempts = 0;
    let runResult;
    while (attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      runResult = await apiCall('GET', `/v1/runs/${run.run_id}`);
      if (runResult.status === 'completed' || runResult.status === 'failed') break;
      attempts++;
    }
    
    console.log('\n=== TRANSFORM STEP ANALYSIS ===');
    const transformStep = runResult.results?.steps?.find(s => s.type === 'transform');
    if (transformStep) {
      console.log('Transform step status:', transformStep.status);
      console.log('Transform step output:', JSON.stringify(transformStep.output, null, 2));
      if (transformStep.error) {
        console.log('Transform step error:', transformStep.error);
      }
    } else {
      console.log('No transform step found in results');
    }
    
    // Show all steps
    console.log('\n=== ALL STEPS ===');
    runResult.results?.steps?.forEach((step, i) => {
      console.log(`Step ${i}: ${step.node_id} (${step.type}) - ${step.status}`);
      if (step.type === 'transform') {
        console.log('  Transform output:', JSON.stringify(step.output, null, 2));
      }
    });
    
    // Cleanup
    await apiCall('DELETE', '/v1/workspace');
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testTransform();
