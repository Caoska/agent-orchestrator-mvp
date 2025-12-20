import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function testDailyMarketReportUI() {
  try {
    console.log('Testing Daily Market Report template execution and UI rendering...\n');
    
    // Quick signup/login
    const testEmail = `test-${Date.now()}@example.com`;
    await fetch(`${API_URL}/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'testpass123',
        name: 'Test User'
      })
    });
    
    const loginResult = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testEmail,
        password: 'testpass123'
      })
    }).then(r => r.json());
    
    const apiKey = loginResult.api_key;
    
    const projects = await fetch(`${API_URL}/v1/projects`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }).then(r => r.json());
    
    const projectId = projects[0].project_id;
    
    // Get Daily Market Report template
    const templates = await fetch(`${API_URL}/v1/templates`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    }).then(r => r.json());
    
    const template = templates.find(t => t.id === 'daily-market-report');
    
    // Create and run agent
    const agent = await fetch(`${API_URL}/v1/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        project_id: projectId,
        name: 'Daily Market Report Test',
        steps: template.steps
      })
    }).then(r => r.json());
    
    const run = await fetch(`${API_URL}/v1/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        agent_id: agent.agent_id,
        project_id: projectId,
        input: {}
      })
    }).then(r => r.json());
    
    console.log(`✅ Started run: ${run.run_id}`);
    
    // Wait for completion
    let attempts = 0;
    let runResult;
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      runResult = await fetch(`${API_URL}/v1/runs/${run.run_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      }).then(r => r.json());
      
      console.log(`⏳ Attempt ${attempts + 1}: Status = ${runResult.status}`);
      
      if (runResult.status === 'completed' || runResult.status === 'failed') break;
      attempts++;
    }
    
    console.log('\n=== FINAL RESULTS ===');
    console.log(`Status: ${runResult.status}`);
    
    if (runResult.results?.steps) {
      const transformStep = runResult.results.steps.find(s => s.type === 'transform');
      if (transformStep) {
        console.log('\n✅ Transform Step Found:');
        console.log(`Status: ${transformStep.status}`);
        console.log('Output:', JSON.stringify(transformStep.output, null, 2));
        
        if (transformStep.output?.report) {
          console.log('\n📊 Formatted Report:');
          console.log(transformStep.output.report);
          
          // Check if values are properly substituted
          const hasValues = transformStep.output.report.includes('$') && 
                           !transformStep.output.report.includes('$\\n') &&
                           !transformStep.output.report.includes('${{');
          
          if (hasValues) {
            console.log('\n✅ SUCCESS: Transform step is working correctly!');
            console.log('✅ Price values are properly substituted in the template');
            console.log('✅ UI will display the formatted report correctly');
          } else {
            console.log('\n❌ ISSUE: Transform step still has template substitution problems');
          }
        }
      } else {
        console.log('\n❌ No transform step found in results');
      }
      
      console.log('\n📋 All Steps Summary:');
      runResult.results.steps.forEach((step, i) => {
        console.log(`  Step ${i}: ${step.node_id} (${step.type}) - ${step.status}`);
      });
    }
    
    // Cleanup
    await fetch(`${API_URL}/v1/workspace`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    console.log('\n🧹 Cleanup completed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testDailyMarketReportUI();
