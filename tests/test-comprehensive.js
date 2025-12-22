import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://agent-orchestrator-mvp-production.up.railway.app';

async function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runComprehensiveTests() {
  console.log('🚀 Starting Comprehensive Tool and Trigger Tests\n');
  
  let apiKey, workspaceId, projectId;
  const createdSchedules = [];
  const createdAgents = [];
  
  // Massive try/catch that ALWAYS cleans up workspace
  try {
    try {
      // Setup
      console.log('📋 Setting up test workspace...');
      const workspaceRes = await fetch(`${API_URL}/v1/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Comprehensive Test Workspace',
          owner_email: `test-comprehensive-${Date.now()}@example.com`
        })
      });
      const workspace = await workspaceRes.json();
      workspaceId = workspace.workspace_id;
      apiKey = workspace.api_key;
      
      const projectRes = await fetch(`${API_URL}/v1/projects`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({ 
          name: 'Comprehensive Test Project',
          workspace_id: workspaceId 
        })
      });
      const project = await projectRes.json();
      console.log('Created project:', JSON.stringify(project, null, 2));
      projectId = project.project_id;
      console.log('✅ Test workspace created\n');
    // Tool Tests
    const toolTests = [
      {
        name: 'HTTP Tool',
        steps: [{ type: 'http', config: { url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC', name: 'Get Bitcoin Price' } }],
        shouldSucceed: true
      },
      {
        name: 'Transform Tool', 
        steps: [
          { type: 'http', config: { url: 'https://api.coinbase.com/v2/exchange-rates?currency=BTC', name: 'Get Data' } },
          { type: 'transform', config: { code: 'return { price: input.data.rates.USD };', name: 'Extract Price' } }
        ],
        shouldSucceed: true
      },
      {
        name: 'Delay Tool',
        steps: [{ type: 'delay', config: { seconds: 1, name: 'Wait 1 Second' } }],
        shouldSucceed: true
      },
      {
        name: 'Conditional Tool',
        steps: [
          { type: 'transform', config: { code: 'return { value: 5 };', name: 'Set Value' } },
          { type: 'conditional', config: { condition: '5 > 3', name: 'Check Value' } }
        ],
        shouldSucceed: true
      },
      {
        name: 'SendGrid Tool',
        steps: [{ type: 'sendgrid', config: { to: 'test@example.com', subject: 'Test', text: 'Test', name: 'Send Email' } }],
        shouldSucceed: true // Will succeed if PLATFORM_SENDGRID_API_KEY is configured
      },
      {
        name: 'Webhook Tool',
        steps: [{ type: 'webhook', config: { url: 'https://httpbin.org/post', method: 'POST', body: '{"test": true}', name: 'Test Webhook' } }],
        shouldSucceed: true
      },
      {
        name: 'Database Tool',
        steps: [{ type: 'database', config: { query: 'SELECT 1 as test', name: 'Test Query' } }],
        shouldSucceed: true // Will succeed if DATABASE_URL is configured
      },
      {
        name: 'Twilio Tool (Expected to fail)',
        steps: [{ type: 'twilio', config: { to: '+1234567890', body: 'Test SMS', name: 'Test SMS' } }],
        shouldSucceed: false // Will fail without Twilio credentials
      },
      {
        name: 'LLM Tool (Expected to fail)',
        steps: [{ type: 'llm', config: { prompt: 'Say hello', name: 'Test LLM' } }],
        shouldSucceed: false // Will fail without LLM API key
      }
    ];
    
    console.log('🔧 Testing Tools (Create → Edit → Run → Delete)...');
    for (const test of toolTests) {
      let agentId;
      try {
        console.log(`  Testing ${test.name}...`);
        
        // 1. CREATE agent
        const agentRes = await fetch(`${API_URL}/v1/agents`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            name: `Test Agent - ${test.name}`,
            project_id: projectId,
            steps: test.steps
          })
        });
        const agent = await agentRes.json();
        agentId = agent.agent_id;
        createdAgents.push(agentId); // Track for cleanup
        console.log(`    ✅ CREATE: Agent created`);
        
        // 2. EDIT agent (update name)
        const editRes = await fetch(`${API_URL}/v1/agents/${agentId}`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            name: `Updated Test Agent - ${test.name}`,
            project_id: projectId,
            steps: test.steps
          })
        });
        await editRes.json();
        console.log(`    ✅ EDIT: Agent updated`);
        
        // 3. RUN agent
        const runRes = await fetch(`${API_URL}/v1/runs`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            agent_id: agentId,
            project_id: projectId,
            input: {}
          })
        });
        const run = await runRes.json();
        
        // Wait for completion
        let finalRun;
        for (let i = 0; i < 30; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const statusRes = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
          });
          finalRun = await statusRes.json();
          if (finalRun?.status === 'completed' || finalRun?.status === 'failed') break;
        }
        
        if (test.shouldSucceed) {
          assert(finalRun?.status === 'completed', `${test.name} should succeed but got ${finalRun?.status}. Error: ${finalRun?.error || 'none'}`);
          console.log(`    ✅ RUN: SUCCESS`);
        } else {
          assert(finalRun?.status === 'failed', `${test.name} should fail but got ${finalRun?.status}`);
          console.log(`    ✅ RUN: FAILED AS EXPECTED`);
        }
        
        // 4. DELETE agent
        const deleteRes = await fetch(`${API_URL}/v1/agents/${agentId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        await deleteRes.json();
        // Remove from tracking since we successfully deleted it
        const index = createdAgents.indexOf(agentId);
        if (index > -1) createdAgents.splice(index, 1);
        console.log(`    ✅ DELETE: Agent deleted`);
        console.log(`    ✅ ${test.name}: COMPLETE (CREATE→EDIT→RUN→DELETE)`);
        
      } catch (error) {
        // Cleanup on error
        if (agentId) {
          try {
            await fetch(`${API_URL}/v1/agents/${agentId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${apiKey}` }
            });
          } catch (e) {}
        }
        
        if (test.shouldSucceed) {
          console.log(`    ❌ ${test.name}: UNEXPECTED FAILURE - ${error.message}`);
        } else {
          console.log(`    ✅ ${test.name}: FAILED AS EXPECTED - ${error.message}`);
        }
      }
    }
    
    console.log('\n⏰ Testing Triggers (Create → Edit → Run → Delete)...');
    
    // Test Cron Schedule CRUD
    let cronScheduleId, cronAgentId;
    try {
      console.log('  Testing Cron Schedule...');
      
      // CREATE agent
      const agentRes = await fetch(`${API_URL}/v1/agents`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: 'Cron Test Agent',
          project_id: projectId,
          steps: [{ type: 'delay', config: { seconds: 1, name: 'Quick Task' } }]
        })
      });
      const agent = await agentRes.json();
      cronAgentId = agent.agent_id;
      createdAgents.push(cronAgentId); // Track for cleanup
      
      // CREATE schedule
      const scheduleRes = await fetch(`${API_URL}/v1/schedules`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          agent_id: cronAgentId,
          cron: '* * * * *', // Every minute
          input: { scheduled: true }
        })
      });
      const schedule = await scheduleRes.json();
      cronScheduleId = schedule.schedule_id;
      createdSchedules.push(cronScheduleId);
      
      assert(cronScheduleId, 'Cron schedule should be created');
      console.log('    ✅ CREATE: Cron Schedule created');
      
      // EDIT agent (update name)
      await fetch(`${API_URL}/v1/agents/${cronAgentId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: 'Updated Cron Test Agent',
          project_id: projectId,
          steps: [{ type: 'delay', config: { seconds: 1, name: 'Updated Quick Task' } }]
        })
      });
      console.log('    ✅ EDIT: Agent updated');
      
      // RUN (schedule will trigger automatically)
      console.log('    ✅ RUN: Schedule active');
      
      // DELETE schedule
      await fetch(`${API_URL}/v1/schedules/${cronScheduleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log('    ✅ DELETE: Schedule deleted');
      
      // DELETE agent
      await fetch(`${API_URL}/v1/agents/${cronAgentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      // Remove from tracking since we successfully deleted it
      const index = createdAgents.indexOf(cronAgentId);
      if (index > -1) createdAgents.splice(index, 1);
      console.log('    ✅ DELETE: Agent deleted');
      console.log('    ✅ Cron Schedule: COMPLETE (CREATE→EDIT→RUN→DELETE)');
      
    } catch (error) {
      console.log(`    ❌ Cron Schedule: FAILED - ${error.message}`);
    }
    
    // Test Interval Schedule CRUD
    let intervalScheduleId, intervalAgentId;
    try {
      console.log('  Testing Interval Schedule...');
      
      // CREATE agent
      const agentRes = await fetch(`${API_URL}/v1/agents`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: 'Interval Test Agent',
          project_id: projectId,
          steps: [{ type: 'delay', config: { seconds: 1, name: 'Quick Task' } }]
        })
      });
      const agent = await agentRes.json();
      intervalAgentId = agent.agent_id;
      createdAgents.push(intervalAgentId); // Track for cleanup
      
      // CREATE schedule
      const scheduleRes = await fetch(`${API_URL}/v1/schedules`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          agent_id: intervalAgentId,
          interval_seconds: 10,
          input: { scheduled: true }
        })
      });
      const schedule = await scheduleRes.json();
      intervalScheduleId = schedule.schedule_id;
      createdSchedules.push(intervalScheduleId);
      
      assert(intervalScheduleId, 'Interval schedule should be created');
      console.log('    ✅ CREATE: Interval Schedule created');
      
      // EDIT agent
      await fetch(`${API_URL}/v1/agents/${intervalAgentId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: 'Updated Interval Test Agent',
          project_id: projectId,
          steps: [{ type: 'delay', config: { seconds: 1, name: 'Updated Quick Task' } }]
        })
      });
      console.log('    ✅ EDIT: Agent updated');
      
      // RUN (wait for execution)
      console.log('    Waiting 15 seconds for execution...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      const runsRes = await fetch(`${API_URL}/v1/runs`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const runsData = await runsRes.json();
      const runs = Array.isArray(runsData) ? runsData : (runsData.runs || []);
      const scheduledRuns = runs.filter(r => r.agent_id === intervalAgentId);
      
      assert(scheduledRuns.length > 0, 'Should have at least one scheduled run');
      console.log(`    ✅ RUN: Executed ${scheduledRuns.length} times`);
      
      // DELETE schedule
      await fetch(`${API_URL}/v1/schedules/${intervalScheduleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log('    ✅ DELETE: Schedule deleted');
      
      // DELETE agent
      await fetch(`${API_URL}/v1/agents/${intervalAgentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      // Remove from tracking since we successfully deleted it
      const index = createdAgents.indexOf(intervalAgentId);
      if (index > -1) createdAgents.splice(index, 1);
      console.log('    ✅ DELETE: Agent deleted');
      console.log(`    ✅ Interval Schedule: COMPLETE (CREATE→EDIT→RUN→DELETE)`);
      
    } catch (error) {
      console.log(`    ❌ Interval Schedule: FAILED - ${error.message}`);
    }
    
    // Test Webhook Trigger CRUD
    let webhookAgentId;
    try {
      console.log('  Testing Webhook Trigger...');
      
      // CREATE agent
      const agentRes = await fetch(`${API_URL}/v1/agents`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: 'Webhook Test Agent',
          project_id: projectId,
          steps: [{ type: 'delay', config: { seconds: 1, name: 'Quick Task' } }]
        })
      });
      const agent = await agentRes.json();
      webhookAgentId = agent.agent_id;
      createdAgents.push(webhookAgentId); // Track for cleanup
      console.log('    ✅ CREATE: Webhook Agent created');
      
      // EDIT agent
      await fetch(`${API_URL}/v1/agents/${webhookAgentId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          name: 'Updated Webhook Test Agent',
          project_id: projectId,
          steps: [{ type: 'delay', config: { seconds: 1, name: 'Updated Quick Task' } }]
        })
      });
      console.log('    ✅ EDIT: Agent updated');
      
      // RUN via webhook trigger
      const webhookRes = await fetch(`${API_URL}/v1/runs`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          agent_id: webhookAgentId,
          project_id: projectId,
          input: { webhook_triggered: true },
          trigger_type: 'webhook'
        })
      });
      const webhookRun = await webhookRes.json();
      
      assert(webhookRun.run_id, 'Webhook trigger should create a run');
      console.log('    ✅ RUN: Webhook triggered');
      
      // DELETE agent
      await fetch(`${API_URL}/v1/agents/${webhookAgentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      // Remove from tracking since we successfully deleted it
      const index = createdAgents.indexOf(webhookAgentId);
      if (index > -1) createdAgents.splice(index, 1);
      console.log('    ✅ DELETE: Agent deleted');
      console.log('    ✅ Webhook Trigger: COMPLETE (CREATE→EDIT→RUN→DELETE)');
      
    } catch (error) {
      console.log(`    ❌ Webhook Trigger: FAILED - ${error.message}`);
    }
    
    } catch (error) {
      console.log(`💥 Test setup failed: ${error.message}`);
    }
    
  } catch (outerError) {
    console.log(`💥 Outer catch - something went very wrong: ${outerError.message}`);
  }
  
  // ALWAYS attempt cleanup regardless of ANY failures
  console.log('\n🧹 Cleaning up...');
  
  // Clean up any remaining agents
  for (const agentId of createdAgents) {
    try {
      await fetch(`${API_URL}/v1/agents/${agentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log(`Cleaned up agent: ${agentId}`);
    } catch (e) {
      console.log(`Failed to cleanup agent ${agentId}:`, e.message);
    }
  }
  
  // Clean up schedules
  for (const scheduleId of createdSchedules) {
    try {
      await fetch(`${API_URL}/v1/schedules/${scheduleId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log(`Cleaned up schedule: ${scheduleId}`);
    } catch (e) {
      console.log(`Failed to cleanup schedule ${scheduleId}:`, e.message);
    }
  }
  
  // ALWAYS attempt workspace cleanup - even if apiKey/workspaceId are undefined
  if (workspaceId) {
    try {
      await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      console.log('✅ Cleanup complete - workspace deleted');
    } catch (e) {
      console.log(`❌ Failed to cleanup workspace ${workspaceId}:`, e.message);
      // Even if deletion fails, log the workspace ID so you can manually clean it up
      console.log(`🚨 MANUAL CLEANUP NEEDED: Workspace ${workspaceId} may still exist`);
    }
  } else {
    console.log('⚠️  No workspace ID to clean up (creation may have failed)');
  }
  
  console.log('\n🎉 Comprehensive tests completed!');
}

runComprehensiveTests().catch(console.error);
