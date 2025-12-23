import fetch from "node-fetch";
const API_URL = process.env.API_URL;

async function test() {
  console.log("Testing conditional logic...\n");
  
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
  
  // Test 1: Check if user ID is greater than 5
  const agent1 = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "Conditional Test",
      steps: [
        {
          type: "http",
          name: "fetch_user",
          config: { url: "https://jsonplaceholder.typicode.com/users/8" },
          output_key: "user"
        },
        {
          type: "conditional",
          name: "check_id",
          config: {
            condition: "{{user.data.id}} > 5"
          },
          output_key: "check"
        }
      ]
    })
  }).then(r => r.json());
  
  const run1 = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent1.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("Test 1: User ID > 5");
  await new Promise(r => setTimeout(r, 2000));
  
  const result1 = await fetch(`${API_URL}/v1/runs/${run1.run_id}`, {
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  }).then(r => r.json());
  
  if (result1.status === "completed") {
    console.log("  User ID:", result1.results[0].result.data.id);
    console.log("  Condition:", result1.results[1].result.condition);
    console.log("  Result:", result1.results[1].result.result);
    console.log("  Branch:", result1.results[1].result.branch);
  }
  
  // Test 2: String comparison
  const agent2 = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "String Conditional",
      steps: [
        {
          type: "http",
          name: "fetch_post",
          config: { url: "https://jsonplaceholder.typicode.com/posts/1" },
          output_key: "post"
        },
        {
          type: "conditional",
          name: "check_user",
          config: {
            condition: "{{post.data.userId}} === 1"
          },
          output_key: "check"
        }
      ]
    })
  }).then(r => r.json());
  
  const run2 = await fetch(`${API_URL}/v1/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ agent_id: agent2.agent_id, project_id: proj.project_id, input: {} })
  }).then(r => r.json());
  
  console.log("\nTest 2: User ID === 1");
  await new Promise(r => setTimeout(r, 2000));
  
  const result2 = await fetch(`${API_URL}/v1/runs/${run2.run_id}`, {
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  }).then(r => r.json());
  
  if (result2.status === "completed") {
    console.log("  User ID:", result2.results[0].result.data.userId);
    console.log("  Condition:", result2.results[1].result.condition);
    console.log("  Result:", result2.results[1].result.result);
    console.log("  Branch:", result2.results[1].result.branch);
  }
  
  console.log("\n✓ Conditional tests completed!");
}

test().catch(console.error);
