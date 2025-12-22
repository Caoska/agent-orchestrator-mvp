import { initDb, db } from './db.js';

export async function resetMonthlyUsage() {
  if (!db) {
    console.error('Database not initialized');
    return;
  }

  try {
    console.log('Resetting monthly usage metrics...');
    const result = await db.query(`
      UPDATE workspaces SET 
        runs_this_month = 0,
        steps_this_month = 0,
        http_calls_this_month = 0,
        webhooks_this_month = 0,
        execution_seconds_this_month = 0,
        emails_this_month = 0,
        sms_this_month = 0
    `);
    console.log(`Monthly usage reset complete. ${result.rowCount} workspaces updated.`);
  } catch (error) {
    console.error('Error resetting monthly usage:', error);
    throw error;
  }
}

// Run monthly reset on the 1st of each month at midnight UTC
// Cron: 0 0 1 * * (minute hour day month dayOfWeek)
export const MONTHLY_RESET_CRON = '0 0 1 * *';
