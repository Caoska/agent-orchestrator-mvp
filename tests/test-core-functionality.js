import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL;
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
    throw err;
  }
}

async function apiCall(method, path, body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey && { 'Authorization': `Bearer ${apiKey}` })
    }
  };
  
  if (body) options.body = JSON.stringify(body);
  
  const response = await fetch(`${API_URL}${path}`, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`${response.status}: ${JSON.stringify(data)}`);
  }
  
  return data;
}

async function runCoreTests() {
  try {
    // Health and basic tests
    await test('Health check', async () => {
      const data = await apiCall('GET', '/health');
      if (data.status !== 'healthy') throw new Error('Not healthy');
    });

    // Auth tests
    await test('Signup', async () => {
      await apiCall('POST', '/v1/auth/signup', {
        name: 'Test User',
        email: testEmail,
        password: testPassword
      });
    });

    await test('Login', async () => {
      const data = await apiCall('POST', '/v1/auth/login', {
        email: testEmail,
        password: testPassword
      });
      if (!data.api_key) throw new Error('No API key returned');
      apiKey = data.api_key;
      workspaceId = data.workspace_id;
    });

    // Project setup
    await test('Create project', async () => {
      const data = await apiCall('POST', '/v1/projects', {
        name: 'Test Project'
      });
      if (!data.project_id) throw new Error('No project_id returned');
      projectId = data.project_id;
    });

    // New endpoint tests
    await test('List tools', async () => {
      const data = await apiCall('GET', '/v1/tools');
      if (!data.tools || !Array.isArray(data.tools)) throw new Error('Tools not returned as array');
      if (data.tools.length !== 9) throw new Error(`Expected 9 tools, got ${data.tools.length}`);
    });

    await test('List triggers', async () => {
      const data = await apiCall('GET', '/v1/triggers');
      if (!data.triggers || !Array.isArray(data.triggers)) throw new Error('Triggers not returned as array');
      if (data.triggers.length !== 5) throw new Error(`Expected 5 triggers, got ${data.triggers.length}`);
    });

    // Create a simple working agent
    await test('Create simple agent', async () => {
      const data = await apiCall('POST', '/v1/agents', {
        project_id: projectId,
        name: 'Simple Test Agent',
        nodes: [
          {
            id: 'step1',
            type: 'transform',
            config: {
              name: 'Success Step',
              code: 'return { success: true, message: "test completed" };'
            }
          }
        ],
        connections: []
      });
      
      if (!data.agent_id) throw new Error('No agent_id returned');
      agentIds.simple = data.agent_id;
    });

    // Test run creation and execution
    await test('Create and run simple agent', async () => {
      const data = await apiCall('POST', '/v1/runs', {
        agent_id: agentIds.simple,
        project_id: projectId,
        input: { test: true },
        run_async: false
      });
      
      if (!data.run_id) throw new Error('No run_id returned');
      runIds.push(data.run_id);
      
      // Wait for completion
      let attempts = 0;
      let runResult;
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runResult = await apiCall('GET', `/v1/runs/${data.run_id}`);
        
        if (runResult.status === 'completed' || runResult.status === 'failed') {
          break;
        }
        attempts++;
      }
      
      if (runResult.status !== 'completed') {
        throw new Error(`Run failed: ${runResult.error}`);
      }
    });

    // Create failing agent for resume tests
    await test('Create failing agent', async () => {
      const data = await apiCall('POST', '/v1/agents', {
        project_id: projectId,
        name: 'Failing Test Agent',
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
            type: 'http',
            config: {
              name: 'Failing Step',
              url: 'https://nonexistent-domain-for-testing-12345.com/fail',
              method: 'GET'
            }
          }
        ],
        connections: [
          { from: 'step1', to: 'step2' }
        ]
      });
      
      if (!data.agent_id) throw new Error('No agent_id returned');
      agentIds.failing = data.agent_id;
    });

    // Run failing agent
    await test('Run failing agent', async () => {
      const data = await apiCall('POST', '/v1/runs', {
        agent_id: agentIds.failing,
        project_id: projectId,
        input: { test: true },
        run_async: false
      });
      
      if (!data.run_id) throw new Error('No run_id returned');
      runIds.push(data.run_id);
      
      // Wait for completion (should fail)
      let attempts = 0;
      let runResult;
      while (attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        runResult = await apiCall('GET', `/v1/runs/${data.run_id}`);
        
        if (runResult.status === 'completed' || runResult.status === 'failed') {
          break;
        }
        attempts++;
      }
      
      if (runResult.status !== 'failed') {
        throw new Error(`Expected run to fail, got status: ${runResult.status}`);
      }
      
      // Verify step 1 succeeded and step 2 failed
      const steps = runResult.results?.steps || [];
      if (steps.length !== 2) throw new Error(`Expected 2 steps, got ${steps.length}`);
      if (steps[0].status !== 'success') throw new Error('Step 1 should have succeeded');
      if (steps[1].status !== 'failed') throw new Error('Step 2 should have failed');
    });

    // Test resume functionality
    await test('Resume failed run', async () => {
      const failedRunId = runIds[runIds.length - 1];
      const data = await apiCall('POST', `/v1/runs/${failedRunId}/resume`);
      
      if (!data.run_id) throw new Error('No new run_id returned');
      if (data.original_run_id !== failedRunId) throw new Error('Original run_id mismatch');
      if (!data.message) throw new Error('No message returned');
      
      runIds.push(data.run_id);
    });

    // Test bulk resume
    await test('Bulk resume failed runs', async () => {
      const data = await apiCall('POST', '/v1/runs/bulk-resume', {
        agent_id: agentIds.failing,
        status_filter: 'failed'
      });
      
      if (typeof data.resumed_count !== 'number') throw new Error('No resumed_count returned');
      if (!Array.isArray(data.resumed_runs)) throw new Error('resumed_runs not an array');
    });

    // Cleanup
    await test('Delete workspace', async () => {
      await apiCall('DELETE', '/v1/workspace');
    });

    console.log('\n🎉 All core tests passed!');
    
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    
    // Cleanup on failure
    try {
      if (apiKey) {
        await apiCall('DELETE', '/v1/workspace');
        console.log('✅ Cleanup completed');
      }
    } catch (cleanupError) {
      console.error('❌ Cleanup failed:', cleanupError.message);
    }
    
    process.exit(1);
  }
}

runCoreTests().catch(console.error);
