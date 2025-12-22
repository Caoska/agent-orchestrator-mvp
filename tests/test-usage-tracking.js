import { expect } from 'chai';
import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://agent-orchestrator-mvp-production.up.railway.app';

describe('Usage Tracking Integration Tests', function() {
  this.timeout(30000);
  
  let apiKey, workspaceId, projectId, agentId;
  
  before(async function() {
    // Create test workspace
    const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Usage Test Workspace',
        owner_email: `test-usage-${Date.now()}@example.com`
      })
    });
    const workspace = await workspaceRes.json();
    workspaceId = workspace.workspace_id;
    apiKey = workspace.api_key;
    
    // Create test project
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ name: 'Usage Test Project' })
    });
    const project = await projectRes.json();
    projectId = project.project_id;
    
    // Create test agent with HTTP steps
    const agentRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        name: 'Usage Test Agent',
        project_id: projectId,
        steps: [
          { type: 'http', config: { url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC', name: 'Get Bitcoin Price' } },
          { type: 'http', config: { url: 'https://httpbin.org/get', name: 'Test Request' } }
        ]
      })
    });
    const agent = await agentRes.json();
    agentId = agent.agent_id;
  });
  
  it('should track usage metrics after agent execution', async function() {
    // Get initial usage
    const initialRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const initialWorkspace = await initialRes.json();
    const initialSteps = initialWorkspace.steps_this_month || 0;
    const initialHttpCalls = initialWorkspace.http_calls_this_month || 0;
    
    // Run the agent
    const runRes = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        agent_id: agentId,
        project_id: projectId,
        input: {}
      })
    });
    const run = await runRes.json();
    
    // Wait for completion
    let finalRun;
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      finalRun = await statusRes.json();
      if (finalRun.status === 'completed' || finalRun.status === 'failed') break;
    }
    
    expect(finalRun.status).to.equal('completed');
    
    // Check updated usage
    const finalRes = await fetch(`${API_URL}/v1/workspace`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const finalWorkspace = await finalRes.json();
    
    console.log('Initial usage:', { steps: initialSteps, http_calls: initialHttpCalls });
    console.log('Final usage:', { 
      steps: finalWorkspace.steps_this_month, 
      http_calls: finalWorkspace.http_calls_this_month 
    });
    
    // Verify usage was tracked
    expect(finalWorkspace.steps_this_month).to.be.greaterThan(initialSteps);
    expect(finalWorkspace.http_calls_this_month).to.be.greaterThan(initialHttpCalls);
    expect(finalWorkspace.steps_this_month - initialSteps).to.equal(2); // 2 HTTP steps
    expect(finalWorkspace.http_calls_this_month - initialHttpCalls).to.equal(2); // 2 HTTP calls
  });
  
  after(async function() {
    // Cleanup
    if (workspaceId) {
      await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
    }
  });
});
