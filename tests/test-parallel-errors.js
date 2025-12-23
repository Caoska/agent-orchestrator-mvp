import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://agent-orchestrator-mvp-production.up.railway.app';

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runParallelErrorTests() {
  console.log('🚀 Starting Parallel Error Handling Tests\n');
  
  let apiKey, workspaceId, projectId;
  
  try {
    // Setup
    console.log('📋 Setting up test workspace...');
    console.log('API URL:', API_URL);
    const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Parallel Error Test Workspace',
        owner_email: `test-parallel-error-${Date.now()}@example.com`
      })
    });
    
    console.log('Workspace response status:', workspaceRes.status);
    console.log('Workspace response headers:', Object.fromEntries(workspaceRes.headers.entries()));
    
    if (!workspaceRes.ok) {
      const errorText = await workspaceRes.text();
      console.error('Workspace creation failed:', workspaceRes.status, errorText);
      throw new Error(`Failed to create workspace: ${workspaceRes.status} ${errorText}`);
    }
    
    try {
      const workspace = await workspaceRes.json();
      workspaceId = workspace.workspace_id;
      apiKey = workspace.api_key;
      console.log('Workspace created:', workspaceId);
    } catch (parseError) {
      const responseText = await workspaceRes.text();
      console.error('Failed to parse workspace response as JSON:', parseError.message);
      console.error('Response text:', responseText);
      throw parseError;
    }
    
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        name: 'Parallel Error Test Project',
        workspace_id: workspaceId 
      })
    });
    
    if (!projectRes.ok) {
      const errorText = await projectRes.text();
      console.error('Project creation failed:', projectRes.status, errorText);
      throw new Error(`Failed to create project: ${projectRes.status} ${errorText}`);
    }
    
    const project = await projectRes.json();
    projectId = project.project_id;

    // Test 1: One Branch Fails (Fail Fast)
    console.log('❌ Test 1: One Parallel Branch Fails');
    const oneBranchFailsAgent = {
      name: 'One Branch Fails Test',
      project_id: projectId,
      steps: [
        {
          tool: 'transform',
          config: {
            name: 'Start',
            code: 'return { message: "Starting" }'
          }
        },
        {
          tool: 'http',
          config: {
            name: 'Success API',
            method: 'GET',
            url: 'https://httpbin.org/status/200'
          },
          connections: [{ to: 'node_3', port: 'output' }]
        },
        {
          tool: 'http',
          config: {
            name: 'Failing API',
            method: 'GET', 
            url: 'https://httpbin.org/status/500'
          },
          connections: [{ to: 'node_3', port: 'output' }]
        },
        {
          tool: 'transform',
          config: {
            name: 'Should Not Execute',
            code: 'return { message: "This should not run" }'
          }
        }
      ]
    };

    const agentRes1 = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(oneBranchFailsAgent)
    });
    const agent1 = await agentRes1.json();

    const runRes1 = await fetch(`${API_URL}/v1/agents/${agent1.agent_id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: {} })
    });
    const run1 = await runRes1.json();

    // Wait for completion
    let runStatus1;
    let attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${API_URL}/v1/runs/${run1.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      runStatus1 = await statusRes.json();
      attempts++;
    } while (runStatus1.status === 'running' && attempts < 30);

    assert(runStatus1.status === 'failed', 'Workflow should fail when one parallel branch fails');
    assert(runStatus1.error, 'Should have error message');
    assert(runStatus1.results?.steps?.some(s => s.status === 'failed'), 'Should show which step failed');
    
    console.log(`✅ Fail-fast behavior verified. Error: ${runStatus1.error}`);
    console.log(`Failed steps: ${runStatus1.results?.steps?.filter(s => s.status === 'failed').map(s => s.node_id).join(', ')}`);

    // Test 2: All Branches Fail
    console.log('\n❌ Test 2: All Parallel Branches Fail');
    const allBranchesFailAgent = {
      name: 'All Branches Fail Test',
      project_id: projectId,
      steps: [
        {
          tool: 'transform',
          config: {
            name: 'Start',
            code: 'return { message: "Starting" }'
          }
        },
        {
          tool: 'http',
          config: {
            name: 'Fail 1',
            method: 'GET',
            url: 'https://httpbin.org/status/404'
          }
        },
        {
          tool: 'http',
          config: {
            name: 'Fail 2',
            method: 'GET',
            url: 'https://httpbin.org/status/500'
          }
        },
        {
          tool: 'transform',
          config: {
            name: 'Invalid Code',
            code: 'throw new Error("Intentional error")'
          }
        }
      ]
    };

    const agentRes2 = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(allBranchesFailAgent)
    });
    const agent2 = await agentRes2.json();

    const runRes2 = await fetch(`${API_URL}/v1/agents/${agent2.agent_id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: {} })
    });
    const run2 = await runRes2.json();

    // Wait for completion
    let runStatus2;
    attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${API_URL}/v1/runs/${run2.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      runStatus2 = await statusRes.json();
      attempts++;
    } while (runStatus2.status === 'running' && attempts < 30);

    assert(runStatus2.status === 'failed', 'Workflow should fail when all branches fail');
    const failedSteps = runStatus2.results?.steps?.filter(s => s.status === 'failed') || [];
    assert(failedSteps.length >= 2, 'Should show multiple failed steps');
    
    console.log(`✅ Multiple failures handled. Failed steps: ${failedSteps.length}`);
    console.log(`Error messages: ${failedSteps.map(s => s.error).join('; ')}`);

    // Test 3: Error Message Clarity
    console.log('\n📝 Test 3: Error Message Clarity');
    const errorClarityAgent = {
      name: 'Error Clarity Test',
      project_id: projectId,
      steps: [
        {
          tool: 'http',
          config: {
            name: 'Trigger',
            method: 'GET',
            url: 'https://httpbin.org/json'
          }
        },
        {
          tool: 'transform',
          config: {
            name: 'Parse JSON',
            code: 'return JSON.parse("invalid json")'
          },
          connections: [{ to: 'node_3', port: 'output' }]
        },
        {
          tool: 'http',
          config: {
            name: 'Bad URL',
            method: 'GET',
            url: 'https://nonexistent-domain-12345.com/api'
          },
          connections: [{ to: 'node_3', port: 'output' }]
        },
        {
          tool: 'transform',
          config: {
            name: 'Final Step',
            code: 'return { done: true }'
          }
        }
      ]
    };

    const agentRes3 = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(errorClarityAgent)
    });
    const agent3 = await agentRes3.json();

    const runRes3 = await fetch(`${API_URL}/v1/agents/${agent3.agent_id}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: {} })
    });
    const run3 = await runRes3.json();

    // Wait for completion
    let runStatus3;
    attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${API_URL}/v1/runs/${run3.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      runStatus3 = await statusRes.json();
      attempts++;
    } while (runStatus3.status === 'running' && attempts < 30);

    assert(runStatus3.status === 'failed', 'Should fail due to parallel errors');
    
    // Check error message clarity
    const steps = runStatus3.results?.steps || [];
    const failedStep = steps.find(s => s.status === 'failed');
    assert(failedStep, 'Should have at least one failed step');
    assert(failedStep.error, 'Failed step should have error message');
    assert(failedStep.node_id, 'Should identify which node failed');
    
    console.log(`✅ Error clarity verified:`);
    console.log(`  - Failed node: ${failedStep.node_id}`);
    console.log(`  - Error: ${failedStep.error}`);
    console.log(`  - Step name: ${failedStep.config?.name || 'unnamed'}`);

    console.log('\n🎉 All parallel error handling tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    // Cleanup
    if (workspaceId) {
      console.log('\n🧹 Cleaning up test workspace...');
      try {
        await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('✅ Cleanup completed');
      } catch (cleanupError) {
        console.error('⚠️ Cleanup failed:', cleanupError.message);
      }
    }
  }
}

runParallelErrorTests().catch(console.error);
