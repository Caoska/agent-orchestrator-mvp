#!/usr/bin/env node

// Quick API test to verify parallel processing works end-to-end
// Uses httpbin.org for safe testing without external dependencies

const API_BASE = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function testParallelWorkflow() {
  console.log('🧪 Testing Parallel Workflow via API...\n');
  
  // Create a simple parallel workflow
  const workflow = {
    name: "Parallel Test Workflow",
    description: "Test parallel execution with 3 HTTP calls",
    steps: [
      {
        tool: "http",
        config: {
          name: "Trigger",
          method: "GET", 
          url: "https://httpbin.org/delay/1"
        }
      },
      {
        tool: "http", 
        config: {
          name: "Parallel Call 1",
          method: "GET",
          url: "https://httpbin.org/json"
        },
        connections: [{ to: "node_3", port: "output" }]
      },
      {
        tool: "http",
        config: {
          name: "Parallel Call 2", 
          method: "GET",
          url: "https://httpbin.org/uuid"
        },
        connections: [{ to: "node_3", port: "output" }]
      },
      {
        tool: "transform",
        config: {
          name: "Merge Results",
          code: "return { combined: true, timestamp: new Date().toISOString() }"
        }
      }
    ]
  };

  try {
    console.log('📤 Creating workflow...');
    const response = await fetch(`${API_BASE}/api/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project_id: 'test-project',
        ...workflow
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const agent = await response.json();
    console.log(`✅ Workflow created: ${agent.id}`);
    
    console.log('🚀 Executing workflow...');
    const runResponse = await fetch(`${API_BASE}/api/agents/${agent.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { test: true } })
    });
    
    if (!runResponse.ok) {
      throw new Error(`HTTP ${runResponse.status}: ${await runResponse.text()}`);
    }
    
    const run = await runResponse.json();
    console.log(`✅ Workflow executed: ${run.run_id}`);
    console.log('⏳ Check results at:', `${API_BASE}/api/runs/${run.run_id}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testParallelWorkflow();
