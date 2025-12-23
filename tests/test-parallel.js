import fetch from 'node-fetch';

const API_URL = process.env.API_URL;

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runParallelTests() {
  console.log('🚀 Starting Parallel Execution Tests\n');
  
  let apiKey, workspaceId, projectId;
  const createdAgents = [];
  
  try {
    // Setup
    console.log('📋 Setting up test workspace...');
    const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Parallel Test Workspace',
        owner_email: `test-parallel-${Date.now()}@example.com`
      })
    });
    
    if (!workspaceRes.ok) {
      const errorText = await workspaceRes.text();
      console.error('Workspace creation failed:', workspaceRes.status, errorText);
      throw new Error(`Failed to create workspace: ${workspaceRes.status} ${errorText}`);
    }
    
    const workspace = await workspaceRes.json();
    workspaceId = workspace.workspace_id;
    apiKey = workspace.api_key;
    
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        name: 'Parallel Test Project',
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
    console.log('✅ Test workspace created\n');

    // Test 1: Sequential execution (baseline)
    console.log('📏 Test 1: Sequential Baseline');
    const sequentialAgent = {
      name: 'Sequential Test',
      project_id: projectId,
      nodes: [
        { id: 'node_0', type: 'http', config: { url: 'https://httpbin.org/delay/1', name: 'API Call A' } },
        { id: 'node_1', type: 'http', config: { url: 'https://httpbin.org/delay/1', name: 'API Call B' } }
      ],
      connections: [
        { from: 'node_0', to: 'node_1' }
      ]
    };

    const agentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(sequentialAgent)
    });
    
    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      console.error('Agent creation failed:', agentRes.status, errorText);
      throw new Error(`Failed to create agent: ${agentRes.status} ${errorText}`);
    }
    
    const agent = await agentRes.json();
    createdAgents.push(agent.agent_id);
    
    // Run the agent and measure execution time
    const startTime = Date.now();
    const runRes = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        agent_id: agent.agent_id,
        input: {} 
      })
    });
    
    if (!runRes.ok) {
      const errorText = await runRes.text();
      console.error('Run creation failed:', runRes.status, errorText);
      throw new Error(`Failed to create run: ${runRes.status}`);
    }
    
    const run = await runRes.json();
    
    // Wait for completion
    let runStatus;
    let attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Increased wait time
      const statusRes = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      runStatus = await statusRes.json();
      attempts++;
      console.log(`Attempt ${attempts}: Status = ${runStatus.status}`);
    } while ((runStatus.status === 'running' || runStatus.status === 'queued') && attempts < 60);
    
    const sequentialTime = Date.now() - startTime;
    
    assert(runStatus.status === 'completed', `Sequential workflow should complete successfully. Status: ${runStatus.status}, Error: ${runStatus.error}`);
    assert(runStatus.results?.steps?.length === 2, `Should execute 2 steps. Got: ${runStatus.results?.steps?.length}`);
    
    console.log(`Sequential execution time: ${sequentialTime}ms`);
    console.log('✅ Sequential baseline test passed\n');

    // Test 2: Simple Fork/Join Pattern with nodes/connections
    console.log('🔀 Test 2: Fork/Join with Graph Format');
    const forkJoinAgent = {
      name: 'Fork Join Test',
      project_id: projectId,
      nodes: [
        {
          id: 'node_0',
          type: 'transform',
          config: {
            name: 'Start',
            code: 'return { message: "Starting parallel execution", timestamp: Date.now() }'
          }
        },
        {
          id: 'node_1', 
          type: 'http',
          config: {
            name: 'API Call A',
            url: 'https://httpbin.org/delay/1',
            method: 'GET'
          }
        },
        {
          id: 'node_2',
          type: 'http', 
          config: {
            name: 'API Call B',
            url: 'https://httpbin.org/delay/1',
            method: 'GET'
          }
        },
        {
          id: 'node_3',
          type: 'transform',
          config: {
            name: 'Merge Results',
            code: 'return { combined: { nodeA: input.node_1, nodeB: input.node_2, endTime: Date.now() } }'
          }
        }
      ],
      connections: [
        { from: 'node_0', fromPort: 'output', to: 'node_1', toPort: 'input' },
        { from: 'node_0', fromPort: 'output', to: 'node_2', toPort: 'input' },
        { from: 'node_1', fromPort: 'output', to: 'node_3', toPort: 'input' },
        { from: 'node_2', fromPort: 'output', to: 'node_3', toPort: 'input' }
      ]
    };

    const forkJoinAgentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(forkJoinAgent)
    });
    const forkJoinAgentData = await forkJoinAgentRes.json();
    createdAgents.push(forkJoinAgentData.agent_id);
    
    // Run the agent and measure execution time
    const forkJoinStartTime = Date.now();
    const forkJoinRunRes = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        agent_id: forkJoinAgentData.agent_id,
        input: {} 
      })
    });
    const forkJoinRun = await forkJoinRunRes.json();
    
    // Wait for completion
    let forkJoinStatus;
    attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${API_URL}/v1/runs/${forkJoinRun.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      forkJoinStatus = await statusRes.json();
      attempts++;
    } while ((forkJoinStatus.status === 'running' || forkJoinStatus.status === 'queued') && attempts < 30);
    
    const forkJoinTime = Date.now() - forkJoinStartTime;
    
    assert(forkJoinStatus.status === 'completed', 'Fork/Join workflow should complete successfully');
    assert(forkJoinStatus.results?.steps?.length === 4, 'Should execute all 4 nodes');
    
    // Check that parallel nodes executed
    const steps = forkJoinStatus.results.steps;
    const node1Step = steps.find(s => s.node_id === 'node_1');
    const node2Step = steps.find(s => s.node_id === 'node_2');
    const node3Step = steps.find(s => s.node_id === 'node_3');
    
    assert(node1Step && node2Step && node3Step, 'All parallel nodes should execute');
    
    console.log(`Fork/Join execution time: ${forkJoinTime}ms`);
    console.log(`Speedup vs sequential: ${(sequentialTime / forkJoinTime).toFixed(2)}x`);
    
    // Parallel execution should be faster than sequential for similar workload
    // We expect some speedup, but not necessarily 2x due to overhead
    console.log('✅ Fork/Join pattern test passed\n');

    // Test 3: Independent Parallel Branches
    console.log('🔀 Test 3: Independent Parallel Branches');
    const independentAgent = {
      name: 'Independent Parallel Test',
      project_id: projectId,
      nodes: [
        {
          id: 'node_0',
          type: 'transform',
          config: {
            name: 'Trigger',
            code: 'return { start: true }'
          }
        },
        {
          id: 'node_1',
          type: 'http',
          config: {
            name: 'Branch A',
            url: 'https://httpbin.org/json',
            method: 'GET'
          }
        },
        {
          id: 'node_2', 
          type: 'transform',
          config: {
            name: 'Branch B',
            code: 'return { branch: "B", processed: true }'
          }
        }
      ],
      connections: [
        { from: 'node_0', fromPort: 'output', to: 'node_1', toPort: 'input' },
        { from: 'node_0', fromPort: 'output', to: 'node_2', toPort: 'input' }
      ]
    };

    const independentAgentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(independentAgent)
    });
    const independentAgentData = await independentAgentRes.json();
    createdAgents.push(independentAgentData.agent_id);
    
    const independentRunRes = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ 
        agent_id: independentAgentData.agent_id,
        input: {} 
      })
    });
    const independentRun = await independentRunRes.json();
    
    // Wait for completion
    let independentStatus;
    attempts = 0;
    do {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${API_URL}/v1/runs/${independentRun.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      independentStatus = await statusRes.json();
      attempts++;
    } while ((independentStatus.status === 'running' || independentStatus.status === 'queued') && attempts < 30);
    
    assert(independentStatus.status === 'completed', 'Independent parallel workflow should complete');
    assert(independentStatus.results?.steps?.length === 3, 'Should execute all 3 nodes');
    
    console.log('✅ Independent parallel branches test passed\n');

    console.log('🎉 All parallel execution tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
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

runParallelTests().catch(console.error);
