import { getDb } from '../lib/db.js';

async function migrateApiKeys() {
  const db = getDb();
  if (!db) {
    console.log('No database connection available');
    return;
  }

  try {
    console.log('Starting API keys migration...');

    // Step 1: Add api_keys column if it doesn't exist
    await db.query(`
      ALTER TABLE workspaces 
      ADD COLUMN IF NOT EXISTS api_keys JSONB DEFAULT '{}'
    `);
    console.log('✓ Added api_keys column');

    // Step 2: Check current state
    const countResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN api_keys IS NOT NULL AND api_keys != '{}' THEN 1 END) as with_json_keys,
        COUNT(CASE WHEN llm_api_key IS NOT NULL OR sendgrid_api_key IS NOT NULL OR twilio_account_sid IS NOT NULL THEN 1 END) as with_old_keys
      FROM workspaces
    `);
    
    const { total, with_json_keys, with_old_keys } = countResult.rows[0];
    console.log(`Current state: ${total} total workspaces, ${with_json_keys} with JSON keys, ${with_old_keys} with old format keys`);

    // Step 3: Migrate data from old columns to JSON format
    const migrateResult = await db.query(`
      UPDATE workspaces 
      SET api_keys = COALESCE(api_keys, '{}') || 
        CASE 
          WHEN llm_api_key IS NOT NULL THEN jsonb_build_object('llm', llm_api_key)
          ELSE '{}'::jsonb
        END ||
        CASE 
          WHEN sendgrid_api_key IS NOT NULL THEN jsonb_build_object('sendgrid', sendgrid_api_key)
          ELSE '{}'::jsonb
        END ||
        CASE 
          WHEN twilio_account_sid IS NOT NULL AND twilio_auth_token IS NOT NULL THEN 
            jsonb_build_object('twilio', jsonb_build_object('account_sid', twilio_account_sid, 'auth_token', twilio_auth_token))
          ELSE '{}'::jsonb
        END
      WHERE (api_keys = '{}' OR api_keys IS NULL) 
        AND (llm_api_key IS NOT NULL OR sendgrid_api_key IS NOT NULL OR twilio_account_sid IS NOT NULL)
    `);
    
    console.log(`✓ Migrated ${migrateResult.rowCount} workspaces to JSON format`);

    // Step 4: Verify migration
    const verifyResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN api_keys IS NOT NULL AND api_keys != '{}' THEN 1 END) as with_json_keys
      FROM workspaces
    `);
    
    console.log(`✓ Verification: ${verifyResult.rows[0].with_json_keys} workspaces now have JSON keys`);

    // Step 5: Show sample of migrated data
    const sampleResult = await db.query(`
      SELECT workspace_id, api_keys, llm_api_key, sendgrid_api_key, twilio_account_sid
      FROM workspaces 
      WHERE api_keys != '{}'
      LIMIT 3
    `);
    
    console.log('\nSample migrated data:');
    sampleResult.rows.forEach(row => {
      console.log(`Workspace ${row.workspace_id}:`);
      console.log(`  JSON keys: ${JSON.stringify(row.api_keys)}`);
      console.log(`  Old llm_api_key: ${row.llm_api_key ? '[REDACTED]' : 'null'}`);
      console.log(`  Old sendgrid_api_key: ${row.sendgrid_api_key ? '[REDACTED]' : 'null'}`);
      console.log(`  Old twilio_account_sid: ${row.twilio_account_sid ? '[REDACTED]' : 'null'}`);
      console.log('');
    });

    console.log('✅ Migration completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Update code to use api_keys JSON column');
    console.log('2. Test thoroughly');
    console.log('3. Run cleanup script to remove old columns');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateApiKeys().catch(console.error);
}

export { migrateApiKeys };
