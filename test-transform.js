import fetch from "node-fetch";
const API_URL = "http://localhost:4000";

async function test() {
  console.log("Testing transform tool...\n");
  
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
      name: "Transform Test",
      steps: [
        {
          type: "http",
          name: "fetch_users",
          config: { url: "https://jsonplaceholder.typicode.com/users" },
          output_key: "users"
        },
        {
          type: "transform",
          name: "extract_and_map",
          config: {
            operations: [
              {
                type: "extract",
                path: "{{users.data.0.name}}",
                key: "first_user_name"
              },
              {
                type: "map",
                array: "{{users.data}}",
                key: "user_list",
                mapping: {
                  name: "name",
                  email: "email",
                  city: "address.city"
                }
              },
              {
                type: "template",
                template: "Found {{users.data.length}} users",
                key: "summary"
              }
            ]
          },
          output_key: "transformed"
        }
      ]
    })
  }).then(r => r.json());
  
  const run = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("Waiting for transformation...\n");
  await new Promise(r => setTimeout(r, 3000));
  
  const result = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  }).then(r => r.json());
  
  if (result.status === "completed") {
    console.log("✓ Transform completed!\n");
    const transformed = result.results[1].result;
    
    console.log("Extracted first user name:", transformed.first_user_name);
    console.log("\nMapped users (first 3):");
    transformed.user_list.slice(0, 3).forEach(u => {
      console.log(`  - ${u.name} (${u.email}) from ${u.city}`);
    });
    console.log("\nSummary:", transformed.summary);
  } else {
    console.log("Status:", result.status);
    if (result.error) console.log("Error:", result.error);
  }
}

test().catch(console.error);
