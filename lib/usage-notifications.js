import { PLANS } from './stripe.js';
import * as data from './data.js';

const NOTIFICATION_THRESHOLDS = [0.8, 0.9, 0.95]; // 80%, 90%, 95%

export async function checkUsageThresholds(workspaceId) {
  const workspace = await data.getWorkspace(workspaceId);
  if (!workspace) return;

  const plan = workspace.plan || 'free';
  const limit = PLANS[plan].runs;
  
  if (limit === -1) return; // unlimited plan
  
  const usage = workspace.runs_this_month / limit;
  const lastNotified = workspace.last_usage_notification || 0;
  
  for (const threshold of NOTIFICATION_THRESHOLDS) {
    if (usage >= threshold && lastNotified < threshold) {
      await sendUsageNotification(workspace, usage, threshold);
      await data.updateWorkspace(workspaceId, { 
        last_usage_notification: threshold 
      });
      break;
    }
  }
}

async function sendUsageNotification(workspace, usage, threshold) {
  const percentage = Math.round(threshold * 100);
  const planLimit = PLANS[workspace.plan || 'free'].runs;
  
  console.log(`🚨 Usage Alert: ${workspace.owner_email} at ${percentage}% (${workspace.runs_this_month}/${planLimit} runs)`);
  
  // TODO: Integrate with SendGrid when ready
  // const emailBody = `
  //   You've used ${workspace.runs_this_month} of your ${planLimit} monthly runs (${percentage}%).
  //   ${threshold >= 0.95 ? 'Upgrade now to avoid service interruption.' : 'Consider upgrading your plan.'}
  // `;
}
