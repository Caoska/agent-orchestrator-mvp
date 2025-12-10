import fetch from "node-fetch";
const API_URL = "http://localhost:4000";

async function test() {
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
      name: "Delay Test",
      steps: [
        { type: "delay", name: "wait", config: { seconds: 2 }, output_key: "d1" },
        { type: "http", name: "fetch", config: { url: "https://jsonplaceholder.typicode.com/posts/1" }, output_key: "post" }
      ]
    })
  }).then(r => r.json());
  
  const start = Date.now();
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("Started run, waiting...");
  
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
      headers: { "Authorization": `Bearer ${ws.api_key}` }
    }).then(r => r.json());
    
    if (result.status === "completed") {
      console.log(`✓ Completed in ${((Date.now() - start) / 1000).toFixed(1)}s (should be ~2s)`);
      console.log("Delay result:", result.results[0].result);
      console.log("HTTP result:", result.results[1].result.data.title);
      return;
    }
  }
}

test().catch(console.error);
