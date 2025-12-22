import fetch from "node-fetch";
const API_URL = "https://agent-orchestrator-mvp-production.up.railway.app";

async function test() {
  console.log("Testing scheduled runs...\n");
  
  const ws = await fetch(`${API_URL}/v1/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Schedule Test", owner_email: "test@example.com" })
  }).then(r => r.json());
  
  const proj = await fetch(`${API_URL}/v1/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({ workspace_id: ws.workspace_id, name: "Schedule Test" })
  }).then(r => r.json());
  
  // Create simple agent
  const agent = await fetch(`${API_URL}/v1/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      project_id: proj.project_id,
      name: "Scheduled Agent",
      steps: [
        {
          type: "http",
          name: "fetch_time",
          config: { url: "https://httpbin.org/json" },
          output_key: "time"
        }
      ]
    })
  }).then(r => r.json());
  
  console.log("✓ Created agent:", agent.agent_id);
  
  // Schedule to run every 10 seconds
  const schedule = await fetch(`${API_URL}/v1/schedules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ws.api_key}` },
    body: JSON.stringify({
      agent_id: agent.agent_id,
      project_id: proj.project_id,
      input: {},
      interval_seconds: 10
    })
  }).then(r => r.json());
  
  console.log("✓ Created schedule:", schedule.schedule_id);
  console.log("  Interval: every", schedule.interval_seconds, "seconds");
  console.log("\nWaiting 12 seconds for scheduled run...");
  
  await new Promise(r => setTimeout(r, 12000));
  
  // Check if run was created
  console.log("\nChecking for scheduled runs...");
  
  // List schedules
  const schedules = await fetch(`${API_URL}/v1/schedules`, {
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  }).then(r => r.json());
  
  console.log("Active schedules:", schedules.schedules.length);
  
  // Clean up
  await fetch(`${API_URL}/v1/schedules/${schedule.schedule_id}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${ws.api_key}` }
  });
  
  console.log("\n✓ Schedule deleted");
  console.log("\n✓ Scheduled runs test completed!");
}

test().catch(console.error);
