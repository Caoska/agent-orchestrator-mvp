import fetch from "node-fetch";
const API_URL = "http://localhost:4000";

async function test() {
  console.log("Testing HTTP POST/PUT/DELETE...\n");
  
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "Test" })
  }).then(r => r.json());
  
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "HTTP Methods Test",
      steps: [
        {
          type: "http",
          name: "post_create",
          config: {
            url: "https://jsonplaceholder.typicode.com/posts",
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: { title: "Test Post", body: "Test content", userId: 1 }
          },
          output_key: "created"
        },
        {
          type: "http",
          name: "put_update",
          config: {
            url: "https://jsonplaceholder.typicode.com/posts/1",
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: { id: 1, title: "Updated", body: "Updated content", userId: 1 }
          },
          output_key: "updated"
        },
        {
          type: "http",
          name: "delete_post",
          config: {
            url: "https://jsonplaceholder.typicode.com/posts/1",
            method: "DELETE"
          },
          output_key: "deleted"
        }
      ]
    })
  }).then(r => r.json());
  
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("Started run, waiting...\n");
  
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { "Authorization": `Bearer ${ws.api_key}` }
    }).then(r => r.json());
    
    if (result.status === "completed") {
      console.log("✓ All HTTP methods completed!\n");
      result.results.forEach(r => {
        console.log(`${r.step}:`);
        console.log(`  Status: ${r.result.status}`);
        console.log(`  Data:`, JSON.stringify(r.result.data).substring(0, 80));
        console.log();
      });
      return;
    }
    
    if (result.status === "failed") {
      console.log("✗ Failed:", result.error);
      return;
    }
  }
}

test().catch(console.error);
