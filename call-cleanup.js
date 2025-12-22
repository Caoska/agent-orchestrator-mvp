// Simple script to call the cleanup endpoint
import fetch from 'node-fetch';

const API_URL = 'https://agent-orchestrator-mvp-production.up.railway.app';

async function callCleanup() {
  try {
    console.log('🧹 Calling cleanup endpoint...');
    
    const res = await fetch(`${API_URL}/v1/admin/cleanup-redis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (res.ok) {
      const result = await res.json();
      console.log('✅ Cleanup successful:', result);
    } else {
      const error = await res.text();
      console.log('❌ Cleanup failed:', error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

callCleanup().catch(console.error);
