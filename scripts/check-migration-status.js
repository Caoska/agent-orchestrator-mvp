import { getDb } from './lib/db.js';

async function checkMigrationStatus() {
  const db = getDb();
  if (!db) {
    console.log('No database connection');
    return;
  }

  try {
    // Check columns
    const result = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'workspaces' 
      ORDER BY column_name
    `);
    
    console.log('Current workspaces table columns:');
    result.rows.forEach(row => console.log('- ' + row.column_name));
    
    // Check if api_keys column exists
    const hasApiKeys = result.rows.some(row => row.column_name === 'api_keys');
    console.log('\napi_keys column exists:', hasApiKeys);
    
    // Sample data
    const sample = await db.query(`
      SELECT workspace_id, api_keys, llm_api_key, sendgrid_api_key, twilio_account_sid, twilio_auth_token 
      FROM workspaces 
      LIMIT 3
    `);
    
    console.log('\nSample data:');
    sample.rows.forEach(row => {
      console.log('Workspace:', row.workspace_id);
      console.log('  api_keys:', row.api_keys);
      console.log('  llm_api_key:', row.llm_api_key ? '[REDACTED]' : null);
      console.log('  sendgrid_api_key:', row.sendgrid_api_key ? '[REDACTED]' : null);
      console.log('  twilio_account_sid:', row.twilio_account_sid ? '[REDACTED]' : null);
      console.log('  twilio_auth_token:', row.twilio_auth_token ? '[REDACTED]' : null);
      console.log('');
    });
    
    // Count workspaces with data in old vs new format
    const counts = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN api_keys IS NOT NULL AND api_keys != '{}' THEN 1 END) as with_json_keys,
        COUNT(CASE WHEN llm_api_key IS NOT NULL OR sendgrid_api_key IS NOT NULL OR twilio_account_sid IS NOT NULL THEN 1 END) as with_old_keys
      FROM workspaces
    `);
    
    console.log('Migration status:');
    console.log('- Total workspaces:', counts.rows[0].total);
    console.log('- With JSON api_keys:', counts.rows[0].with_json_keys);
    console.log('- With old format keys:', counts.rows[0].with_old_keys);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await db.end();
  }
}

checkMigrationStatus();
