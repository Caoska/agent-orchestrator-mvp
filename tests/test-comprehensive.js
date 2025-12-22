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
      body: JSON.stringify({ name: 'Comprehensive Test Project' })
    });
    const project = await projectRes.json();
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
          { type: 'conditional', config: { condition: 'input.value > 3', name: 'Check Value' } }
        ],
        shouldSucceed: true
      },
      {
        name: 'SendGrid Tool (Expected to fail)',
        steps: [{ type: 'sendgrid', config: { to: 'test@example.com', subject: 'Test', text: 'Test', name: 'Send Email' } }],
        shouldSucceed: false
      }
    ];
    
    console.log('🔧 Testing Tools...');
    for (const test of toolTests) {
      try {
        console.log(`  Testing ${test.name}...`);
        
        // Create agent
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
        
        // Run agent
        const runRes = await fetch(`${API_URL}/v1/runs`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            agent_id: agent.agent_id,
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
          if (finalRun.status === 'completed' || finalRun.status === 'failed') break;
        }
        
        if (test.shouldSucceed) {
          assert(finalRun.status === 'completed', `${test.name} should succeed but got ${finalRun.status}`);
          console.log(`    ✅ ${test.name}: SUCCESS`);
        } else {
          assert(finalRun.status === 'failed', `${test.name} should fail but got ${finalRun.status}`);
          console.log(`    ✅ ${test.name}: FAILED AS EXPECTED`);
        }
        
      } catch (error) {
        if (test.shouldSucceed) {
          console.log(`    ❌ ${test.name}: UNEXPECTED FAILURE - ${error.message}`);
        } else {
          console.log(`    ✅ ${test.name}: FAILED AS EXPECTED - ${error.message}`);
        }
      }
    }
    
    console.log('\n⏰ Testing Triggers...');
    
    // Test Cron Schedule
    try {
      console.log('  Testing Cron Schedule...');
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
      
      const scheduleRes = await fetch(`${API_URL}/v1/schedules`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          cron: '* * * * *', // Every minute
          input: { scheduled: true }
        })
      });
      const schedule = await scheduleRes.json();
      createdSchedules.push(schedule.schedule_id);
      
      assert(schedule.schedule_id, 'Cron schedule should be created');
      console.log('    ✅ Cron Schedule: CREATED');
      
    } catch (error) {
      console.log(`    ❌ Cron Schedule: FAILED - ${error.message}`);
    }
    
    // Test Interval Schedule
    try {
      console.log('  Testing Interval Schedule...');
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
      
      const scheduleRes = await fetch(`${API_URL}/v1/schedules`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          agent_id: agent.agent_id,
          interval_seconds: 10,
          input: { scheduled: true }
        })
      });
      const schedule = await scheduleRes.json();
      createdSchedules.push(schedule.schedule_id);
      
      assert(schedule.schedule_id, 'Interval schedule should be created');
      
      // Wait for execution
      console.log('    Waiting 15 seconds for execution...');
      await new Promise(resolve => setTimeout(resolve, 15000));
      
      const runsRes = await fetch(`${API_URL}/v1/runs`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      const runs = await runsRes.json();
      const scheduledRuns = runs.filter(r => r.agent_id === agent.agent_id);
      
      assert(scheduledRuns.length > 0, 'Should have at least one scheduled run');
      console.log(`    ✅ Interval Schedule: EXECUTED ${scheduledRuns.length} times`);
      
    } catch (error) {
      console.log(`    ❌ Interval Schedule: FAILED - ${error.message}`);
    }
    
  } catch (error) {
    console.log(`💥 Test setup failed: ${error.message}`);
  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    for (const scheduleId of createdSchedules) {
      try {
        await fetch(`${API_URL}/v1/schedules/${scheduleId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
      } catch (e) {
        console.log(`Failed to cleanup schedule ${scheduleId}:`, e.message);
      }
    }
    
    if (workspaceId) {
      try {
        await fetch(`${API_URL}/v1/workspaces/${workspaceId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        console.log('✅ Cleanup complete');
      } catch (e) {
        console.log('Failed to cleanup workspace:', e.message);
      }
    }
  }
  
  console.log('\n🎉 Comprehensive tests completed!');
}

runComprehensiveTests().catch(console.error);
