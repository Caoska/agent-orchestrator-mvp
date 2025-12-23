import fetch from "node-fetch";

const API_URL = process.env.API_URL;

async function test() {
  // 1. Create workspace
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Test Workspace", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  console.log("Created workspace:", ws);
  const apiKey = ws.api_key;
  
  // 2. Create project
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "Test Project" })
  }).then(r => r.json());
  
  console.log("Created project:", proj);
  
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
  
  console.log("Created agent:", agent);
  
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
  
  console.log("Started run:", run);
  
  // 5. Poll for completion
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
    headers: { "Authorization": `Bearer ${apiKey}` }
  }).then(r => r.json());
  
  console.log("Run result:", JSON.stringify(result, null, 2));
}

test().catch(console.error);
