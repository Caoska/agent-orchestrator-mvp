import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function testDatabaseFunctions() {
  console.log('🔍 Testing Database Functions...\n');
  
  try {
    // 1. Create workspace
    const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'DB Test Workspace',
        owner_email: `dbtest-${Date.now()}@example.com`
      })
    });
    
    const workspaceData = await workspaceRes.json();
    const apiKey = workspaceData.api_key;
    const workspaceId = workspaceData.workspace_id;
    console.log('✅ Workspace created:', workspaceId);
    
    // 2. Create project
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'DB Test Project',
        workspace_id: workspaceId
      })
    });
    
    const projectData = await projectRes.json();
    const projectId = projectData.project_id;
    console.log('✅ Project created:', projectId);
    
    // 3. Test if we can retrieve the project via API
    const projectsRes = await fetch(`${API_URL}/v1/projects`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    const projects = await projectsRes.json();
    const foundProject = projects.find(p => p.project_id === projectId);
    
    console.log('✅ Project retrieval test:', foundProject ? 'SUCCESS' : 'FAILED');
    console.log('   Found project:', foundProject?.project_id);
    console.log('   Expected project:', projectId);
    
    // Cleanup
    await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    console.log('✅ Cleanup complete');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDatabaseFunctions().catch(console.error);
