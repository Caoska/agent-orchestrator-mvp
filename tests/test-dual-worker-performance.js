import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://agent-orchestrator-mvp-production.up.railway.app';
let apiKey = null;
let workspaceId = null;
let projectId = null;

const testEmail = `perf-test-${Date.now()}@example.com`;
const testPassword = 'testpass123';

async function apiCall(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });
  
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  
  return res.json();
}

async function setup() {
  console.log('🔧 Setting up test environment...');
  
  // Create test account
  const signupData = await apiCall('POST', '/v1/auth/signup', {
    name: 'Performance Test User',
    email: testEmail,
    password: testPassword
  });
  
  apiKey = signupData.apiKey;
  workspaceId = signupData.workspace_id;
  
  // Create project
  const projectData = await apiCall('POST', '/v1/projects', { 
    workspace_id: workspaceId,
    name: 'Performance Test Project' 
  });
  
  projectId = projectData.project_id;
  console.log('✅ Test environment ready');
}

async function cleanup() {
  if (apiKey) {
    try {
      await apiCall('DELETE', '/v1/workspace');
      console.log('🧹 Cleaned up test workspace');
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

async function createAgent(name, steps) {
  const data = await apiCall('POST', '/v1/agents', {
    project_id: projectId,
    name,
    steps
  });
  return data.agent_id;
}

async function runAgent(agentId, input = {}) {
  const startTime = Date.now();
  
  const runData = await apiCall('POST', '/v1/runs', {
    agent_id: agentId,
    project_id: projectId,
    input
  });
  
  const runId = runData.run_id;
  
  // Poll for completion
  let status = 'running';
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max
  
  while (status === 'running' && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const runStatus = await apiCall('GET', `/v1/runs/${runId}`);
    status = runStatus.status;
    attempts++;
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  return { runId, status, duration, startTime, endTime };
}

async function performanceTest() {
  console.log('\n🚀 DUAL WORKER PERFORMANCE TEST\n');
  console.log('This test demonstrates how dual workers prevent head-of-line blocking:\n');
  
  await setup();
  
  // Create agents for testing
  console.log('📝 Creating test agents...');
  
  // Agent with slow operation (30 second delay)
  const slowAgentId = await createAgent('Slow Agent', [
    {
      type: 'delay',
      config: { seconds: 30 }
    },
    {
      type: 'transform',
      config: {
        operations: [
          { type: 'template', key: 'result', template: 'Slow operation completed at {{timestamp}}' }
        ]
      }
    }
  ]);
  
  // Agent with fast operations only
  const fastAgentId = await createAgent('Fast Agent', [
    {
      type: 'http',
      config: {
        url: 'https://httpbin.org/get',
        method: 'GET'
      }
    },
    {
      type: 'transform',
      config: {
        operations: [
          { type: 'template', key: 'result', template: 'Fast operation completed at {{timestamp}}' }
        ]
      }
    }
  ]);
  
  // Agent with mixed operations
  const mixedAgentId = await createAgent('Mixed Agent', [
    {
      type: 'http',
      config: {
        url: 'https://httpbin.org/get',
        method: 'GET'
      }
    },
    {
      type: 'delay',
      config: { seconds: 10 }
    },
    {
      type: 'transform',
      config: {
        operations: [
          { type: 'template', key: 'result', template: 'Mixed operation completed at {{timestamp}}' }
        ]
      }
    }
  ]);
  
  console.log('✅ Test agents created\n');
  
  // Test 1: Sequential execution (what single worker would do)
  console.log('📊 TEST 1: Sequential Execution (Single Worker Simulation)');
  console.log('Running slow agent, then fast agents...\n');
  
  const sequentialStart = Date.now();
  
  // Run slow agent first
  console.log('⏳ Starting slow agent (30s delay)...');
  const slowResult = await runAgent(slowAgentId, { timestamp: new Date().toISOString() });
  console.log(`   ✅ Slow agent completed in ${slowResult.duration}ms`);
  
  // Then run fast agents
  console.log('⚡ Starting fast agents...');
  const fastResults = await Promise.all([
    runAgent(fastAgentId, { timestamp: new Date().toISOString() }),
    runAgent(fastAgentId, { timestamp: new Date().toISOString() }),
    runAgent(fastAgentId, { timestamp: new Date().toISOString() })
  ]);
  
  const sequentialTotal = Date.now() - sequentialStart;
  
  console.log(`   ✅ Fast agents completed in: ${fastResults.map(r => r.duration + 'ms').join(', ')}`);
  console.log(`📈 Sequential total time: ${sequentialTotal}ms\n`);
  
  // Test 2: Parallel execution (dual worker advantage)
  console.log('📊 TEST 2: Parallel Execution (Dual Worker Architecture)');
  console.log('Running slow and fast agents simultaneously...\n');
  
  const parallelStart = Date.now();
  
  // Start all agents simultaneously
  console.log('🚀 Starting all agents in parallel...');
  const parallelPromises = [
    runAgent(slowAgentId, { timestamp: new Date().toISOString() }),
    runAgent(mixedAgentId, { timestamp: new Date().toISOString() }),
    runAgent(fastAgentId, { timestamp: new Date().toISOString() }),
    runAgent(fastAgentId, { timestamp: new Date().toISOString() }),
    runAgent(fastAgentId, { timestamp: new Date().toISOString() })
  ];
  
  // Track completion times
  const completionTimes = [];
  const results = [];
  
  for (let i = 0; i < parallelPromises.length; i++) {
    const result = await parallelPromises[i];
    const relativeTime = result.endTime - parallelStart;
    completionTimes.push(relativeTime);
    results.push(result);
    
    const agentType = i === 0 ? 'slow' : i === 1 ? 'mixed' : 'fast';
    console.log(`   ✅ ${agentType} agent completed at +${relativeTime}ms (duration: ${result.duration}ms)`);
  }
  
  const parallelTotal = Date.now() - parallelStart;
  console.log(`📈 Parallel total time: ${parallelTotal}ms\n`);
  
  // Analysis
  console.log('📊 PERFORMANCE ANALYSIS\n');
  
  const fastAgentAvg = fastResults.reduce((sum, r) => sum + r.duration, 0) / fastResults.length;
  const parallelFastAvg = results.slice(2).reduce((sum, r) => sum + r.duration, 0) / 3;
  
  console.log(`⏱️  Average fast agent time:`);
  console.log(`   Sequential: ${Math.round(fastAgentAvg)}ms`);
  console.log(`   Parallel: ${Math.round(parallelFastAvg)}ms`);
  console.log(`   Difference: ${Math.round(fastAgentAvg - parallelFastAvg)}ms\n`);
  
  console.log(`🏁 Total execution time:`);
  console.log(`   Sequential: ${sequentialTotal}ms`);
  console.log(`   Parallel: ${parallelTotal}ms`);
  console.log(`   Time saved: ${sequentialTotal - parallelTotal}ms (${Math.round((1 - parallelTotal/sequentialTotal) * 100)}%)\n`);
  
  // Key insights
  console.log('🎯 KEY INSIGHTS:\n');
  
  if (parallelFastAvg < fastAgentAvg * 1.1) { // Within 10% is good
    console.log('✅ DUAL WORKER SUCCESS: Fast operations were NOT blocked by slow operations');
    console.log('   Fast agents completed quickly even while slow agent was running');
  } else {
    console.log('⚠️  Potential issue: Fast operations may have been delayed');
  }
  
  if (parallelTotal < sequentialTotal * 0.8) { // More than 20% improvement
    console.log('✅ PARALLEL EXECUTION: Significant time savings from concurrent processing');
  } else {
    console.log('⚠️  Limited parallelization benefit observed');
  }
  
  const fastCompletionTimes = completionTimes.slice(2);
  const maxFastTime = Math.max(...fastCompletionTimes);
  const minFastTime = Math.min(...fastCompletionTimes);
  
  if (maxFastTime - minFastTime < 5000) { // Within 5 seconds
    console.log('✅ CONSISTENT PERFORMANCE: Fast operations completed within similar timeframes');
  }
  
  console.log('\n🏆 DUAL WORKER ARCHITECTURE PERFORMANCE TEST COMPLETE!\n');
  
  await cleanup();
}

// Handle cleanup on exit
process.on('beforeExit', cleanup);
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

performanceTest().catch(error => {
  console.error('❌ Performance test failed:', error.message);
  cleanup();
  process.exit(1);
});
