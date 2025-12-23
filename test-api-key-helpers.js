import { getApiKey, setApiKey, getAllApiKeys } from './lib/api-keys.js';

function testApiKeyHelpers() {
  console.log('🧪 Testing API key helper functions...\n');

  // Test 1: Old format workspace
  console.log('Test 1: Old format workspace');
  const oldWorkspace = {
    workspace_id: 'test-old',
    llm_api_key: 'sk-old-llm-key',
    sendgrid_api_key: 'SG.old-sendgrid-key',
    twilio_account_sid: 'AC-old-sid',
    twilio_auth_token: 'old-auth-token'
  };

  console.log('  LLM key:', getApiKey(oldWorkspace, 'llm'));
  console.log('  SendGrid key:', getApiKey(oldWorkspace, 'sendgrid'));
  console.log('  Twilio SID:', getApiKey(oldWorkspace, 'twilio', 'account_sid'));
  console.log('  Twilio token:', getApiKey(oldWorkspace, 'twilio', 'auth_token'));
  console.log('  All keys:', JSON.stringify(getAllApiKeys(oldWorkspace), null, 2));

  // Test 2: New format workspace
  console.log('\nTest 2: New format workspace');
  const newWorkspace = {
    workspace_id: 'test-new',
    api_keys: {
      llm: 'sk-new-llm-key',
      sendgrid: 'SG.new-sendgrid-key',
      twilio: {
        account_sid: 'AC-new-sid',
        auth_token: 'new-auth-token'
      }
    }
  };

  console.log('  LLM key:', getApiKey(newWorkspace, 'llm'));
  console.log('  SendGrid key:', getApiKey(newWorkspace, 'sendgrid'));
  console.log('  Twilio SID:', getApiKey(newWorkspace, 'twilio', 'account_sid'));
  console.log('  Twilio token:', getApiKey(newWorkspace, 'twilio', 'auth_token'));
  console.log('  All keys:', JSON.stringify(getAllApiKeys(newWorkspace), null, 2));

  // Test 3: Mixed format (should prefer new format)
  console.log('\nTest 3: Mixed format workspace (should prefer new format)');
  const mixedWorkspace = {
    workspace_id: 'test-mixed',
    llm_api_key: 'sk-old-llm-key',
    api_keys: {
      llm: 'sk-new-llm-key',
      sendgrid: 'SG.new-sendgrid-key'
    },
    twilio_account_sid: 'AC-old-sid'
  };

  console.log('  LLM key (should be new):', getApiKey(mixedWorkspace, 'llm'));
  console.log('  SendGrid key (should be new):', getApiKey(mixedWorkspace, 'sendgrid'));
  console.log('  Twilio SID (should be old):', getApiKey(mixedWorkspace, 'twilio', 'account_sid'));

  // Test 4: Setting API keys
  console.log('\nTest 4: Setting API keys');
  let apiKeys = {};
  apiKeys = setApiKey(apiKeys, 'llm', 'sk-test-key');
  apiKeys = setApiKey(apiKeys, 'twilio', 'AC-test-sid', 'account_sid');
  apiKeys = setApiKey(apiKeys, 'twilio', 'test-token', 'auth_token');
  
  console.log('  Built API keys object:', JSON.stringify(apiKeys, null, 2));

  console.log('\n✅ All tests completed!');
}

testApiKeyHelpers();
