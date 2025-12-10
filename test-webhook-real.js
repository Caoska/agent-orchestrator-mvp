import fetch from "node-fetch";

const API_URL = "https://agent-orchestrator-mvp-production.up.railway.app";

async function test() {
  console.log("Testing webhook with Railway API...\n");
  
  // Create workspace
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Webhook Test", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  console.log("✓ Created workspace:", ws.workspace_id);
  const apiKey = ws.api_key;
  
  // Create project
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "Webhook Test" })
  }).then(r => r.json());
  
  console.log("✓ Created project:", proj.project_id);
  
  // Create agent that fetches data then webhooks it back to health endpoint
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "Webhook Test Agent",
      steps: [
        {
          type: "http",
          name: "fetch_user",
          config: {
            url: "https://jsonplaceholder.typicode.com/users/1",
            method: "GET"
          },
          output_key: "user"
        },
        {
          type: "webhook",
          name: "send_webhook",
          config: {
            url: `${API_URL}/health`,
            method: "POST",
            payload: {
              message: "Webhook test from agent",
              user_name: "{{user.data.name}}",
              user_email: "{{user.data.email}}",
              timestamp: new Date().toISOString()
            }
          },
          output_key: "webhook_response"
        }
      ]
    })
  }).then(r => r.json());
  
  console.log("✓ Created agent:", agent.agent_id);
  
  // Start run
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      agent_id: agent.agent_id,
      project_id: proj.project_id,
      input: {}
    })
  }).then(r => r.json());
  
  console.log("✓ Started run:", run.run_id);
  console.log("\nWaiting for webhook execution...");
  
  // Poll for completion
  for (let i = 0; i < 15; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    }).then(r => r.json());
    
    console.log(`  Status: ${result.status}`);
    
    if (result.status === "completed") {
      console.log("\n✓ Webhook executed successfully!\n");
      console.log("Step 1 - Fetch User:");
      console.log("  User:", result.results[0].result.data.name);
      console.log("\nStep 2 - Webhook:");
      console.log("  Status:", result.results[1].result.status);
      console.log("  Response:", result.results[1].result.response);
      return;
    }
    
    if (result.status === "failed") {
      console.log("\n✗ Run failed:", result.error);
      return;
    }
  }
  
  console.log("\n⚠ Run still processing after 15 seconds");
}

test().catch(console.error);
