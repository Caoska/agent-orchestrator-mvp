import fetch from "node-fetch";

const API_URL = process.env.API_URL;

async function test() {
  console.log("Testing webhook and delay tools...\n");
  
  // Create workspace
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test WS", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  const apiKey = ws.api_key;
  
  // Create project
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "Test Project" })
  }).then(r => r.json());
  
  // Create agent with webhook and delay
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "Webhook & Delay Agent",
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
          type: "delay",
          name: "wait_2_seconds",
          config: {
            seconds: 2
          },
          output_key: "delay_result"
        },
        {
          type: "webhook",
          name: "send_to_webhook",
          config: {
            url: "https://webhook.site/unique-id-here",
            method: "POST",
            payload: {
              message: "User fetched",
              user_name: "{{user.data.name}}",
              user_email: "{{user.data.email}}"
            }
          },
          output_key: "webhook_result"
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
  console.log("\nWaiting for execution (should take ~2 seconds due to delay)...");
  
  const startTime = Date.now();
  
  // Poll for completion
  for (let i = 0; i < 10; i++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` }
    }).then(r => r.json());
    
    if (result.status === "completed") {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✓ Run completed in ${duration}s`);
      console.log("\nResults:");
      result.results.forEach(r => {
        console.log(`  ${r.step}:`, JSON.stringify(r.result).substring(0, 100));
      });
      return;
    }
    
    if (result.status === "failed") {
      console.log("\n✗ Run failed:", result.error);
      return;
    }
  }
}

test().catch(console.error);
