import { getDb } from './lib/db.js';

async function checkUsers() {
  console.log('Checking if we have any users...');
  
  // Try to connect to production database via Railway CLI
  try {
    const { execSync } = await import('child_process');
    
    // Check if railway CLI is available
    try {
      execSync('railway --version', { stdio: 'ignore' });
      console.log('Railway CLI found, attempting to connect...');
      
      const result = execSync('railway run --service postgres psql $DATABASE_URL -c "SELECT COUNT(*) FROM workspaces;"', { 
        encoding: 'utf8',
        cwd: process.cwd()
      });
      
      console.log('Database query result:', result);
      
    } catch (railwayError) {
      console.log('Railway CLI not available or connection failed:', railwayError.message);
      console.log('\nTo check manually:');
      console.log('1. Install Railway CLI: npm install -g @railway/cli');
      console.log('2. Login: railway login');
      console.log('3. Link project: railway link');
      console.log('4. Run: railway run --service postgres psql $DATABASE_URL -c "SELECT COUNT(*) FROM workspaces;"');
    }
    
  } catch (error) {
    console.error('Error checking users:', error.message);
  }
}

checkUsers();
