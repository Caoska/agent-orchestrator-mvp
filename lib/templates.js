export const TEMPLATES = [
  {
    id: 'lead-notification',
    name: 'Lead Notification',
    description: 'New form submission → Email + Slack alert',
    category: 'sales',
    steps: [
      {
        tool: 'sendgrid',
        config: {
          name: 'Email to sales',
          from: 'alerts@yourcompany.com',
          to: 'sales@yourcompany.com',
          subject: 'New Lead: {{input.name}}',
          text: 'Name: {{input.name}}\nEmail: {{input.email}}\nMessage: {{input.message}}'
        }
      },
      {
        tool: 'webhook',
        config: {
          name: 'Slack notification',
          url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
          method: 'POST',
          body: {
            text: '🎯 New lead from {{input.name}} ({{input.email}})'
          }
        }
      }
    ]
  },
  {
    id: 'customer-onboarding',
    name: 'Customer Onboarding',
    description: 'New signup → Welcome email + CRM + Team notification',
    category: 'sales',
    steps: [
      {
        tool: 'sendgrid',
        config: {
          name: 'Welcome email',
          from: 'welcome@yourcompany.com',
          to: '{{input.email}}',
          subject: 'Welcome to Our Platform!',
          text: 'Hi {{input.name}},\n\nWelcome aboard! We\'re excited to have you.'
        }
      },
      {
        tool: 'http',
        config: {
          name: 'Create CRM contact',
          url: 'https://api.yourcrm.com/contacts',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY',
            'Content-Type': 'application/json'
          },
          body: {
            name: '{{input.name}}',
            email: '{{input.email}}',
            source: 'signup'
          }
        }
      },
      {
        tool: 'webhook',
        config: {
          name: 'Notify team',
          url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
          method: 'POST',
          body: {
            text: '🎉 New customer: {{input.name}}'
          }
        }
      }
    ]
  },
  {
    id: 'daily-market-report',
    name: 'Daily Market Report',
    description: 'Fetch stocks + crypto prices → Email summary',
    category: 'reporting',
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Get Bitcoin price',
          url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
          method: 'GET'
        }
      },
      {
        tool: 'http',
        config: {
          name: 'Get Ethereum price',
          url: 'https://api.coinbase.com/v2/prices/ETH-USD/spot',
          method: 'GET'
        }
      },
      {
        tool: 'http',
        config: {
          name: 'Get stock data',
          url: 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d',
          method: 'GET'
        }
      },
      {
        tool: 'transform',
        config: {
          name: 'Format report',
          script: `const btc = node_0.data.amount;
const eth = node_1.data.amount;
const stock = node_2.chart.result[0].meta.regularMarketPrice;

return {
  report: \`Daily Market Report
  
Bitcoin: $\${btc}
Ethereum: $\${eth}
AAPL: $\${stock}

Generated: \${new Date().toLocaleString()}\`
};`
        }
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Email report',
          from: 'reports@yourcompany.com',
          to: 'you@yourcompany.com',
          subject: 'Daily Market Report',
          text: '{{node_3.report}}'
        }
      }
    ]
  },
  {
    id: 'content-approval',
    name: 'AI Content Approval',
    description: 'Submit content → AI review → Conditional routing',
    category: 'automation',
    steps: [
      {
        tool: 'llm',
        config: {
          name: 'AI content review',
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'Review this content for professionalism and appropriateness. Respond with only "APPROVED" or "REJECTED":\n\n{{input.content}}',
          temperature: 0.3
        }
      },
      {
        tool: 'conditional',
        config: {
          name: 'Check approval',
          condition: 'node_0.includes("APPROVED")'
        },
        connections: [
          { port: 'true', to: 'node_2' },
          { port: 'false', to: 'node_3' }
        ]
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Approval notification',
          from: 'content@yourcompany.com',
          to: '{{input.author_email}}',
          subject: 'Content Approved ✓',
          text: 'Your content has been approved and published!'
        }
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Rejection notification',
          from: 'content@yourcompany.com',
          to: '{{input.author_email}}',
          subject: 'Content Needs Revision',
          text: 'Your content needs revision before publishing.'
        }
      }
    ]
  },
  {
    id: 'api-health-monitor',
    name: 'API Health Monitor',
    description: 'Check API → If error → Multi-channel alert',
    category: 'monitoring',
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Check API health',
          url: 'https://api.yourservice.com/health',
          method: 'GET'
        }
      },
      {
        tool: 'conditional',
        config: {
          name: 'Check if healthy',
          condition: 'node_0.status === "ok"'
        },
        connections: [
          { port: 'false', to: 'node_2' }
        ]
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Email alert',
          from: 'alerts@yourcompany.com',
          to: 'oncall@yourcompany.com',
          subject: '🚨 API Health Check Failed',
          text: 'API health check failed at {{node_0.timestamp}}'
        }
      },
      {
        tool: 'webhook',
        config: {
          name: 'Slack alert',
          url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
          method: 'POST',
          body: {
            text: '🚨 API DOWN - Health check failed!'
          }
        }
      },
      {
        tool: 'twilio',
        config: {
          name: 'SMS alert',
          from: '+1234567890',
          to: '+1234567890',
          body: 'URGENT: API health check failed'
        }
      }
    ]
  },
  {
    id: 'invoice-reminder',
    name: 'Invoice Reminder',
    description: 'Check unpaid invoices → Send reminder emails',
    category: 'finance',
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Get unpaid invoices',
          url: 'https://api.stripe.com/v1/invoices?status=open',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer sk_test_YOUR_KEY'
          }
        }
      },
      {
        tool: 'transform',
        config: {
          name: 'Filter overdue',
          script: `const invoices = node_0.data.filter(inv => {
  const dueDate = new Date(inv.due_date * 1000);
  return dueDate < new Date();
});
return { overdue: invoices };`
        }
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Send reminders',
          from: 'billing@yourcompany.com',
          to: '{{node_1.overdue[0].customer_email}}',
          subject: 'Payment Reminder',
          text: 'Your invoice is overdue. Please submit payment.'
        }
      }
    ]
  },
  {
    id: 'data-sync',
    name: 'Database Sync',
    description: 'Fetch API data → Transform → Store in database',
    category: 'data',
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Fetch data',
          url: 'https://api.example.com/data',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY'
          }
        }
      },
      {
        tool: 'transform',
        config: {
          name: 'Transform data',
          script: `return {
  records: node_0.items.map(item => ({
    id: item.id,
    name: item.name,
    value: item.value,
    synced_at: new Date().toISOString()
  }))
};`
        }
      },
      {
        tool: 'database',
        config: {
          name: 'Insert to database',
          connection_string: 'postgresql://user:pass@host:5432/db',
          query: 'INSERT INTO synced_data (id, name, value, synced_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name=$2, value=$3, synced_at=$4'
        }
      }
    ]
  },
  {
    id: 'webhook-router',
    name: 'Webhook Router',
    description: 'Receive webhook → Route based on condition',
    category: 'automation',
    steps: [
      {
        tool: 'conditional',
        config: {
          name: 'Check event type',
          condition: 'input.event_type === "payment"'
        },
        connections: [
          { port: 'true', to: 'node_1' },
          { port: 'false', to: 'node_2' }
        ]
      },
      {
        tool: 'webhook',
        config: {
          name: 'Route to payments',
          url: 'https://api.yourservice.com/payments/webhook',
          method: 'POST',
          body: '{{input}}'
        }
      },
      {
        tool: 'webhook',
        config: {
          name: 'Route to general',
          url: 'https://api.yourservice.com/general/webhook',
          method: 'POST',
          body: '{{input}}'
        }
      }
    ]
  }
];

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id);
}

export function getTemplatesByCategory(category) {
  return TEMPLATES.filter(t => t.category === category);
}

export function getAllCategories() {
  return [...new Set(TEMPLATES.map(t => t.category))];
}
