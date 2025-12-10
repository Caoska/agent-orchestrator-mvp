import Stripe from 'stripe';
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const PLANS = {
  free: { runs: 200, price: 0 },
  starter: { runs: 5000, price: 1900 }, // $19/month
  pro: { runs: 50000, price: 9900 }, // $99/month
  enterprise: { runs: -1, price: null } // contact us, unlimited
};

export async function createCheckoutSession(workspaceId, plan, successUrl, cancelUrl) {
  if (!stripe) throw new Error('Stripe not configured');
  if (!PLANS[plan].price) throw new Error('Contact us for enterprise pricing');
  
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: { name: `Agent Orchestrator - ${plan}` },
        unit_amount: PLANS[plan].price,
        recurring: { interval: 'month' }
      },
      quantity: 1
    }],
    metadata: { workspace_id: workspaceId, plan },
    success_url: successUrl,
    cancel_url: cancelUrl
  });
  
  return session;
}

export async function createPortalSession(customerId, returnUrl) {
  if (!stripe) throw new Error('Stripe not configured');
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  });
  
  return session;
}

export function canExecuteRun(workspace) {
  const plan = workspace.plan || 'free';
  const limit = PLANS[plan].runs;
  
  if (limit === -1) return true; // unlimited
  return workspace.runs_this_month < limit;
}

export { stripe };
