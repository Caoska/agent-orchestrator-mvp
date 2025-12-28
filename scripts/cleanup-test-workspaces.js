import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function cleanupOrphanedWorkspaces() {
  console.log('🧹 Cleaning up test workspaces...');
  
  try {
    // Get all workspaces
    const res = await fetch(`${API_URL}/v1/admin/workspaces`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!res.ok) {
      console.log('❌ Could not fetch workspaces (admin endpoint may not exist)');
      return;
    }
    
    const workspaces = await res.json();
    console.log(`Found ${workspaces.length} workspaces`);
    
    // Delete test workspaces (those with test emails)
    for (const workspace of workspaces) {
      if (workspace.owner_email && workspace.owner_email.includes('test-')) {
        try {
          const deleteRes = await fetch(`${API_URL}/v1/workspaces/${workspace.workspace_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${workspace.api_key}` }
          });
          
          if (deleteRes.ok) {
            console.log(`✅ Deleted test workspace: ${workspace.workspace_id}`);
          } else {
            console.log(`❌ Failed to delete workspace: ${workspace.workspace_id}`);
          }
        } catch (e) {
          console.log(`❌ Error deleting workspace ${workspace.workspace_id}:`, e.message);
        }
      }
    }
    
  } catch (error) {
    console.log('❌ Cleanup failed:', error.message);
  }
}

cleanupOrphanedWorkspaces().catch(console.error);
