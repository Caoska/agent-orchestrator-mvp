import fetch from "node-fetch";
const API_URL = process.env.API_URL;

async function test() {
  console.log("Testing database tool...\n");
  
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "DB Test", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "DB Test" })
  }).then(r => r.json());
  
  // Test 1: Query workspaces table
  const agent1 = await fetch(`${API_URL}/v1/agents`, {
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
            query: "SELECT workspace_id, name, owner_email FROM workspaces LIMIT 5"
          },
          output_key: "workspaces"
        }
      ]
    })
  }).then(r => r.json());
  
  const run1 = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent1.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("Test 1: Query workspaces table");
  await new Promise(r => setTimeout(r, 2000));
  
  const result1 = await fetch(`${API_URL}/v1/runs/${run1.run_id}`, {
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  }).then(r => r.json());
  
  if (result1.status === "completed") {
    console.log(`  Found ${result1.results[0].result.rowCount} workspaces`);
    result1.results[0].result.rows.forEach(row => {
      console.log(`    - ${row.name} (${row.owner_email})`);
    });
  } else {
    console.log("  Status:", result1.status);
    if (result1.error) console.log("  Error:", result1.error);
  }
  
  // Test 2: Parameterized query
  const agent2 = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "Parameterized Query",
      steps: [
        {
          type: "database",
          name: "find_workspace",
          config: {
            query: "SELECT * FROM workspaces WHERE workspace_id = $1",
            params: ["{{workspace_id}}"]
          },
          output_key: "workspace"
        }
      ]
    })
  }).then(r => r.json());
  
  const run2 = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ 
      agent_id: agent2.agent_id, 
      project_id: proj.project_id, 
      input: { workspace_id: ws.workspace_id }
    })
  }).then(r => r.json());
  
  console.log("\nTest 2: Parameterized query");
  await new Promise(r => setTimeout(r, 2000));
  
  const result2 = await fetch(`${API_URL}/v1/runs/${run2.run_id}`, {
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  }).then(r => r.json());
  
  if (result2.status === "completed") {
    const workspace = result2.results[0].result.rows[0];
    console.log(`  Found workspace: ${workspace.name}`);
    console.log(`  API Key: ${workspace.api_key.substring(0, 20)}...`);
  } else {
    console.log("  Status:", result2.status);
    if (result2.error) console.log("  Error:", result2.error);
  }
  
  console.log("\n✓ Database tests completed!");
}

test().catch(console.error);
