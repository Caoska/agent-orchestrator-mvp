import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'https://api.siloworker.dev';

async function testPublicEndpoints() {
  console.log('🧪 Testing New Public API Endpoints\n');
  
  try {
    // Test 1: List Tools
    console.log('1. Testing GET /v1/tools...');
    const toolsResponse = await fetch(`${API_URL}/v1/tools`);
    const toolsData = await toolsResponse.json();
    
    if (toolsResponse.ok && toolsData.tools && Array.isArray(toolsData.tools)) {
      console.log(`✅ Tools endpoint works - found ${toolsData.tools.length} tools`);
      console.log(`   Expected tools found: ${toolsData.tools.map(t => t.type).join(', ')}`);
      
      // Verify expected tools are present
      const expectedTools = ['http', 'sendgrid', 'twilio', 'database', 'llm', 'conditional', 'transform', 'webhook', 'delay'];
      const foundTools = toolsData.tools.map(t => t.type);
      const missingTools = expectedTools.filter(tool => !foundTools.includes(tool));
      
      if (missingTools.length === 0) {
        console.log('   ✅ All expected tools present');
      } else {
        console.log(`   ❌ Missing tools: ${missingTools.join(', ')}`);
        return false;
      }
    } else {
      console.log('❌ Tools endpoint failed');
      console.log('Response:', toolsData);
      return false;
    }
    
    // Test 2: List Triggers
    console.log('\n2. Testing GET /v1/triggers...');
    const triggersResponse = await fetch(`${API_URL}/v1/triggers`);
    const triggersData = await triggersResponse.json();
    
    if (triggersResponse.ok && triggersData.triggers && Array.isArray(triggersData.triggers)) {
      console.log(`✅ Triggers endpoint works - found ${triggersData.triggers.length} triggers`);
      console.log(`   Expected triggers found: ${triggersData.triggers.map(t => t.type).join(', ')}`);
      
      // Verify expected triggers are present
      const expectedTriggers = ['manual', 'webhook', 'schedule', 'email', 'sms'];
      const foundTriggers = triggersData.triggers.map(t => t.type);
      const missingTriggers = expectedTriggers.filter(trigger => !foundTriggers.includes(trigger));
      
      if (missingTriggers.length === 0) {
        console.log('   ✅ All expected triggers present');
      } else {
        console.log(`   ❌ Missing triggers: ${missingTriggers.join(', ')}`);
        return false;
      }
    } else {
      console.log('❌ Triggers endpoint failed');
      console.log('Response:', triggersData);
      return false;
    }
    
    // Test 3: Test resume endpoint without auth (should return 401)
    console.log('\n3. Testing POST /v1/runs/test/resume (should require auth)...');
    const resumeResponse = await fetch(`${API_URL}/v1/runs/test/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (resumeResponse.status === 401) {
      console.log('✅ Resume endpoint correctly requires authentication');
    } else {
      console.log(`❌ Resume endpoint should return 401, got ${resumeResponse.status}`);
      return false;
    }
    
    // Test 4: Test bulk resume endpoint without auth (should return 401)
    console.log('\n4. Testing POST /v1/runs/bulk-resume (should require auth)...');
    const bulkResumeResponse = await fetch(`${API_URL}/v1/runs/bulk-resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (bulkResumeResponse.status === 401) {
      console.log('✅ Bulk resume endpoint correctly requires authentication');
    } else {
      console.log(`❌ Bulk resume endpoint should return 401, got ${bulkResumeResponse.status}`);
      return false;
    }
    
    console.log('\n🎉 All new endpoint tests passed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ GET /v1/tools - Lists 9 available tools');
    console.log('   ✅ GET /v1/triggers - Lists 5 available triggers');
    console.log('   ✅ POST /v1/runs/:id/resume - Requires authentication');
    console.log('   ✅ POST /v1/runs/bulk-resume - Requires authentication');
    console.log('\n💡 Resume endpoints require authenticated testing with valid runs');
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    return false;
  }
}

// Run the test
testPublicEndpoints().then(success => {
  process.exit(success ? 0 : 1);
});
