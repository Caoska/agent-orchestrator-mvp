import fetch from "node-fetch";
const API_URL = "https://agent-orchestrator-mvp-production.up.railway.app";

async function test() {
  console.log("Testing database tool on Railway...\n");
  
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "DB Test", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  console.log("✓ Created workspace:", ws.workspace_id);
  
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "DB Test" })
  }).then(r => r.json());
  
  console.log("✓ Created project:", proj.project_id);
  
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "DB Query Test",
      steps: [
        {
          type: "database",
          name: "list_workspaces",
          config: {
            query: "SELECT workspace_id, name, owner_email, created_at FROM workspaces ORDER BY created_at DESC LIMIT 5"
          },
          output_key: "workspaces"
        }
      ]
    })
  }).then(r => r.json());
  
  console.log("✓ Created agent:", agent.agent_id);
  
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("✓ Started run:", run.run_id);
  console.log("\nWaiting for database query...");
  
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    
    const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { "Authorization": `Bearer ${ws.api_key}` }
    }).then(r => r.json());
    
    console.log(`  Status: ${result.status}`);
    
    if (result.status === "completed") {
      console.log("\n✓ Database query completed!\n");
      console.log(`Found ${result.results[0].result.rowCount} workspaces:`);
      result.results[0].result.rows.forEach(row => {
        console.log(`  - ${row.name} (${row.owner_email})`);
      });
      return;
    }
    
    if (result.status === "failed") {
      console.log("\n✗ Failed:", result.error);
      return;
    }
  }
}

test().catch(console.error);
