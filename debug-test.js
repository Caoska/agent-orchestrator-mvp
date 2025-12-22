import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://agent-orchestrator-mvp-production.up.railway.app';

async function testBasicAgent() {
  console.log('🔍 Testing basic agent creation...');
  
  try {
    // Create workspace
    const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Debug Test Workspace',
        owner_email: `debug-${Date.now()}@example.com`
      })
    });
    
    if (!workspaceRes.ok) {
      const errorText = await workspaceRes.text();
      console.error('❌ Workspace creation failed:', workspaceRes.status, errorText);
      return;
    }
    
    const workspace = await workspaceRes.json();
    console.log('✅ Workspace created:', workspace.workspace_id);
    
    // Create project
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workspace.api_key}`
      },
      body: JSON.stringify({ 
        name: 'Debug Test Project',
        workspace_id: workspace.workspace_id 
      })
    });
    
    if (!projectRes.ok) {
      const errorText = await projectRes.text();
      console.error('❌ Project creation failed:', projectRes.status, errorText);
      return;
    }
    
    const project = await projectRes.json();
    console.log('✅ Project created:', project.project_id);
    
    // Test 1: Create agent with steps format (should work)
    console.log('\n📝 Testing steps format...');
    const stepsAgent = {
      name: 'Steps Test Agent',
      project_id: project.project_id,
      steps: [{ type: 'transform', config: { code: 'return { test: true }', name: 'Test Step' } }]
    };
    
    const stepsRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workspace.api_key}`
      },
      body: JSON.stringify(stepsAgent)
    });
    
    if (!stepsRes.ok) {
      const errorText = await stepsRes.text();
      console.error('❌ Steps agent creation failed:', stepsRes.status, errorText);
    } else {
      const stepsAgentData = await stepsRes.json();
      console.log('✅ Steps agent created:', stepsAgentData.agent_id);
    }
    
    // Test 2: Create agent with nodes/connections format (new)
    console.log('\n🔗 Testing nodes/connections format...');
    const nodesAgent = {
      name: 'Nodes Test Agent',
      project_id: project.project_id,
      nodes: [
        {
          id: 'node_0',
          type: 'transform',
          config: { code: 'return { test: true }', name: 'Test Node' }
        }
      ],
      connections: []
    };
    
    const nodesRes = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${workspace.api_key}`
      },
      body: JSON.stringify(nodesAgent)
    });
    
    if (!nodesRes.ok) {
      const errorText = await nodesRes.text();
      console.error('❌ Nodes agent creation failed:', nodesRes.status, errorText);
      console.error('Response body:', errorText);
    } else {
      const nodesAgentData = await nodesRes.json();
      console.log('✅ Nodes agent created:', nodesAgentData.agent_id);
    }
    
    // Cleanup
    await fetch(`${API_URL}/v1/workspaces/${workspace.workspace_id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${workspace.api_key}` }
    });
    console.log('\n✅ Cleanup completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testBasicAgent();
