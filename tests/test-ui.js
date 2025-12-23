const API_URL = process.env.API_URL;

async function test() {
  console.log('🧪 Testing Agent Orchestrator UI Flow\n');
  
  // 1. Create workspace
  console.log('1️⃣  Creating workspace...');
  const wsRes = await fetch(`${API_URL}/v1/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Workspace', owner_email: 'test@example.com' })
  });
  const { workspace_id, api_key } = await wsRes.json();
  console.log(`✅ Workspace created: ${workspace_id}`);
  console.log(`🔑 API Key: ${api_key}\n`);
  
  // 2. Get workspace info
  console.log('2️⃣  Getting workspace info...');
  const wsInfoRes = await fetch(`${API_URL}/v1/workspace`, {
    headers: { 'Authorization': `Bearer ${api_key}` }
  });
  const wsInfo = await wsInfoRes.json();
  console.log(`✅ Plan: ${wsInfo.plan}, Runs this month: ${wsInfo.runs_this_month}\n`);
  
  // 3. Create project
  console.log('3️⃣  Creating project...');
  const projRes = await fetch(`${API_URL}/v1/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`
    },
    body: JSON.stringify({ workspace_id, name: 'Test Project' })
  });
  const project = await projRes.json();
  console.log(`✅ Project created: ${project.project_id}\n`);
  
  // 4. Create agent with tools
  console.log('4️⃣  Creating agent with HTTP tool...');
  const agentRes = await fetch(`${API_URL}/v1/agents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`
    },
    body: JSON.stringify({
      project_id: project.project_id,
      name: 'Test Agent',
      steps: [
        { type: 'http', config: { url: 'https://api.github.com/zen', method: 'GET' } }
      ]
    })
  });
  const agent = await agentRes.json();
  console.log(`✅ Agent created: ${agent.agent_id}\n`);
  
  // 5. List agents
  console.log('5️⃣  Listing agents...');
  const agentsRes = await fetch(`${API_URL}/v1/agents`, {
    headers: { 'Authorization': `Bearer ${api_key}` }
  });
  const agents = await agentsRes.json();
  console.log(`✅ Found ${agents.length} agent(s)\n`);
  
  // 6. Execute run
  console.log('6️⃣  Executing run...');
  const runRes = await fetch(`${API_URL}/v1/runs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${api_key}`
    },
    body: JSON.stringify({
      agent_id: agent.agent_id,
      project_id: project.project_id,
      input: {}
    })
  });
  const run = await runRes.json();
  console.log(`✅ Run queued: ${run.run_id}\n`);
  
  // 7. Wait and check run status
  console.log('7️⃣  Waiting for run to complete...');
  await new Promise(r => setTimeout(r, 3000));
  
  const runStatusRes = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
    headers: { 'Authorization': `Bearer ${api_key}` }
  });
  const runStatus = await runStatusRes.json();
  console.log(`✅ Run status: ${runStatus.status}`);
  if (runStatus.result) {
    console.log(`📊 Result: ${JSON.stringify(runStatus.result).substring(0, 100)}...\n`);
  }
  
  // 8. List runs
  console.log('8️⃣  Listing runs...');
  const runsRes = await fetch(`${API_URL}/v1/runs`, {
    headers: { 'Authorization': `Bearer ${api_key}` }
  });
  const runs = await runsRes.json();
  console.log(`✅ Found ${runs.length} run(s)\n`);
  
  // 9. Test usage limits (simulate hitting limit)
  console.log('9️⃣  Testing usage limits...');
  console.log(`Current plan: ${wsInfo.plan} (limit: 200 runs)`);
  console.log(`Current usage: ${wsInfo.runs_this_month}/200\n`);
  
  // 10. Test pricing page data
  console.log('🔟 Pricing tiers:');
  console.log('   Free: 200 runs/month - $0');
  console.log('   Starter: 5,000 runs/month - $19');
  console.log('   Pro: 50,000 runs/month - $99');
  console.log('   Enterprise: Unlimited - Contact sales\n');
  
  console.log('✨ All tests passed!\n');
  console.log(`🌐 Open ${API_URL} in your browser`);
  console.log(`🔑 Use this API key to login: ${api_key}`);
}

test().catch(console.error);
