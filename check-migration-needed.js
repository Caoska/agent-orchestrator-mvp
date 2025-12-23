#!/usr/bin/env node

/**
 * Simple script to determine if API key migration is needed
 * This can be run locally or in production to check the current state
 */

console.log('🔍 Checking if API key migration is needed...\n');

// Check if we're in a production environment
const isProduction = process.env.NODE_ENV === 'production';
const hasDbUrl = !!process.env.DATABASE_URL;

console.log('Environment:', isProduction ? 'production' : 'development');
console.log('Database URL configured:', hasDbUrl);

if (!hasDbUrl) {
  console.log('\n❌ No DATABASE_URL configured');
  console.log('Migration status: UNKNOWN (no database connection)');
  console.log('\nTo check in production:');
  console.log('1. Deploy this script to Railway');
  console.log('2. Or use Railway CLI: railway run node check-migration-needed.js');
  process.exit(0);
}

// Try to connect to database
try {
  const { getDb } = await import('./lib/db.js');
  const db = getDb();
  
  if (!db) {
    console.log('\n❌ Could not connect to database');
    process.exit(1);
  }

  // Check if workspaces table exists
  const tableCheck = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'workspaces'
    );
  `);
  
  if (!tableCheck.rows[0].exists) {
    console.log('\n✅ No workspaces table found - fresh installation');
    console.log('Migration status: NOT NEEDED (new installation)');
    await db.end();
    process.exit(0);
  }

  // Check workspace count
  const countResult = await db.query('SELECT COUNT(*) as total FROM workspaces');
  const totalWorkspaces = parseInt(countResult.rows[0].total);
  
  console.log(`\n📊 Found ${totalWorkspaces} workspaces`);
  
  if (totalWorkspaces === 0) {
    console.log('✅ No workspaces exist - no migration needed');
    console.log('Migration status: NOT NEEDED (no users)');
    await db.end();
    process.exit(0);
  }

  // Check if api_keys column exists
  const columnCheck = await db.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = 'workspaces' AND column_name = 'api_keys'
    );
  `);
  
  const hasApiKeysColumn = columnCheck.rows[0].exists;
  console.log('api_keys column exists:', hasApiKeysColumn);
  
  if (!hasApiKeysColumn) {
    console.log('\n⚠️  Migration REQUIRED: api_keys column missing');
    console.log('Run: node scripts/migrate-api-keys.js');
    await db.end();
    process.exit(1);
  }

  // Check migration status
  const statusResult = await db.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN api_keys IS NOT NULL AND api_keys != '{}' THEN 1 END) as with_json_keys,
      COUNT(CASE WHEN llm_api_key IS NOT NULL OR sendgrid_api_key IS NOT NULL OR twilio_account_sid IS NOT NULL THEN 1 END) as with_old_keys
    FROM workspaces
  `);
  
  const { total, with_json_keys, with_old_keys } = statusResult.rows[0];
  
  console.log(`\n📈 Migration status:`);
  console.log(`- Total workspaces: ${total}`);
  console.log(`- With JSON api_keys: ${with_json_keys}`);
  console.log(`- With old format keys: ${with_old_keys}`);
  
  if (with_old_keys > 0 && with_json_keys === 0) {
    console.log('\n⚠️  Migration REQUIRED: All workspaces use old format');
    console.log('Run: node scripts/migrate-api-keys.js');
  } else if (with_old_keys > 0 && with_json_keys > 0) {
    console.log('\n⚠️  Migration PARTIALLY COMPLETE: Mixed formats detected');
    console.log('Run: node scripts/migrate-api-keys.js');
  } else if (with_json_keys > 0 && with_old_keys === 0) {
    console.log('\n✅ Migration COMPLETE: All workspaces use JSON format');
    console.log('Optional: Run cleanup script to remove old columns');
  } else {
    console.log('\n✅ No API keys configured - migration not needed');
  }
  
  await db.end();
  
} catch (error) {
  console.error('\n❌ Error checking migration status:', error.message);
  process.exit(1);
}
