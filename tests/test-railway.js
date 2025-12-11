import fetch from "node-fetch";

const API_URL = "https://agent-orchestrator-mvp-production.up.railway.app";

async function test() {
  console.log("Testing Railway deployment...\n");
  
  // 1. Create workspace
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Workspace", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  console.log("✓ Created workspace:", ws.workspace_id);
  const apiKey = ws.api_key;
  
  // 2. Create project
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "Test Project" })
  }).then(r => r.json());
  
  console.log("✓ Created project:", proj.project_id);
  
  // 3. Create agent with HTTP step
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "Test Agent",
      steps: [
        {
          type: "http",
          name: "fetch_data",
          config: {
            url: "https://jsonplaceholder.typicode.com/posts/1",
            method: "GET"
          },
          output_key: "post"
        }
      ]
    })
  }).then(r => r.json());
  
  console.log("✓ Created agent:", agent.agent_id);
  
  // 4. Start run
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      agent_id: agent.agent_id,
      project_id: proj.project_id,
      input: { user_id: 123 }
    })
  }).then(r => r.json());
  
  console.log("✓ Started run:", run.run_id);
  console.log("\nWaiting for worker to process...");
  
  // 5. Poll for completion
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    }).then(r => r.json());
    
    console.log(`  Status: ${result.status}`);
    
    if (result.status === "completed") {
      console.log("\n✓ Run completed successfully!");
      console.log("\nResults:", JSON.stringify(result.results, null, 2));
      return;
    }
    
    if (result.status === "failed") {
      console.log("\n✗ Run failed:", result.error);
      return;
    }
  }
  
  console.log("\n⚠ Run still processing after 20 seconds");
}

test().catch(console.error);
