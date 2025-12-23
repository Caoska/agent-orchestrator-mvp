import { getDb } from '../lib/db.js';

async function cleanupOldApiKeyColumns() {
  const db = getDb();
  if (!db) {
    console.log('No database connection available');
    return;
  }

  try {
    console.log('🧹 Starting cleanup of old API key columns...');

    // Step 1: Verify all data has been migrated
    const verifyResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN api_keys IS NOT NULL AND api_keys != '{}' THEN 1 END) as with_json_keys,
        COUNT(CASE WHEN llm_api_key IS NOT NULL OR sendgrid_api_key IS NOT NULL OR twilio_account_sid IS NOT NULL THEN 1 END) as with_old_keys
      FROM workspaces
    `);
    
    const { total, with_json_keys, with_old_keys } = verifyResult.rows[0];
    console.log(`Current state: ${total} total workspaces, ${with_json_keys} with JSON keys, ${with_old_keys} with old format keys`);

    if (with_old_keys > 0 && with_json_keys === 0) {
      console.log('❌ Migration appears incomplete. Run migrate-api-keys.js first.');
      return;
    }

    // Step 2: Show what will be removed
    const sampleResult = await db.query(`
      SELECT workspace_id, llm_api_key, sendgrid_api_key, twilio_account_sid, api_keys
      FROM workspaces 
      WHERE llm_api_key IS NOT NULL OR sendgrid_api_key IS NOT NULL OR twilio_account_sid IS NOT NULL
      LIMIT 5
    `);
    
    if (sampleResult.rows.length > 0) {
      console.log('\nSample workspaces with old format keys that will be cleaned up:');
      sampleResult.rows.forEach(row => {
        console.log(`- ${row.workspace_id}: old keys present, JSON keys: ${JSON.stringify(row.api_keys)}`);
      });
    }

    // Step 3: Ask for confirmation (in a real scenario, you'd want user input)
    console.log('\n⚠️  WARNING: This will permanently remove the old API key columns:');
    console.log('   - llm_api_key');
    console.log('   - sendgrid_api_key'); 
    console.log('   - twilio_account_sid');
    console.log('   - twilio_auth_token');
    console.log('   - openai_api_key (if exists)');
    
    // For now, just log what would be done - uncomment to actually execute
    console.log('\n🔍 DRY RUN - Would execute these commands:');
    
    const columnsToRemove = [
      'llm_api_key',
      'sendgrid_api_key', 
      'twilio_account_sid',
      'twilio_auth_token',
      'openai_api_key'
    ];

    for (const column of columnsToRemove) {
      console.log(`   ALTER TABLE workspaces DROP COLUMN IF EXISTS ${column};`);
    }

    console.log('\n💡 To actually execute the cleanup, uncomment the execution code in this script.');
    
    // UNCOMMENT BELOW TO ACTUALLY EXECUTE THE CLEANUP
    /*
    console.log('\n🗑️  Executing cleanup...');
    
    for (const column of columnsToRemove) {
      try {
        await db.query(`ALTER TABLE workspaces DROP COLUMN IF EXISTS ${column}`);
        console.log(`✓ Removed column: ${column}`);
      } catch (error) {
        console.log(`⚠️  Could not remove ${column}: ${error.message}`);
      }
    }
    
    console.log('✅ Cleanup completed!');
    */

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    throw error;
  } finally {
    await db.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupOldApiKeyColumns().catch(console.error);
}

export { cleanupOldApiKeyColumns };
