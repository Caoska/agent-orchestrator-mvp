export const TEMPLATES = [
  {
    id: 'lead-notification',
    name: 'Lead Notification',
    description: 'New form submission → Email + Slack alert',
    category: 'sales',
    trigger: {
      type: 'webhook_trigger',
      path: '/webhook/new-lead'
    },
    steps: [
      {
        tool: 'sendgrid',
        config: {
          name: 'Email to sales',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
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
    triggers: [
      {
        type: 'webhook_trigger',
        path: '/webhook/new-signup'
      },
      {
        type: 'email_trigger', 
        address: 'signup@yourcompany.com'
      }
    ],
    steps: [
      {
        tool: 'sendgrid',
        config: {
          name: 'Welcome email',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
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
    trigger: {
      type: 'cron',
      schedule: '0 9 * * *' // 9 AM daily
    },
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
          url: 'https://api.coinbase.com/v2/prices/LTC-USD/spot',
          method: 'GET'
        }
      },
      {
        tool: 'transform',
        config: {
          name: 'Format report',
          operations: [
            {
              type: 'extract',
              key: 'btc_price',
              path: '{{node_0.data.data.amount}}'
            },
            {
              type: 'extract', 
              key: 'eth_price',
              path: '{{node_1.data.data.amount}}'
            },
            {
              type: 'extract',
              key: 'stock_price', 
              path: '{{node_2.data.chart.result.0.meta.regularMarketPrice}}'
            },
            {
              type: 'template',
              key: 'report',
              template: 'Daily Market Report\n\nBitcoin: ${{btc_price}}\nEthereum: ${{eth_price}}\nAAPL: ${{stock_price}}\n\nGenerated at: {{timestamp}}'
            }
          ]
        }
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Email report',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
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
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
          to: '{{input.author_email}}',
          subject: 'Content Approved ✓',
          text: 'Your content has been approved and published!'
        }
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Rejection notification',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
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
    trigger: {
      type: 'cron',
      schedule: '*/5 * * * *' // Every 5 minutes
    },
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Check API health',
          url: 'https://httpbin.org/status/200',
          method: 'GET'
        }
      },
      {
        tool: 'conditional',
        config: {
          name: 'Check if healthy',
          condition: '{{node_0.status}} == 200'
        },
        connections: [
          { port: 'false', to: 'node_2' }
        ]
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Email alert',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
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
    trigger: {
      type: 'cron',
      schedule: '0 10 * * 1' // Mondays at 10 AM
    },
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
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
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
          url: 'https://httpbin.org/json',
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
          connection_string: 'postgresql://user:pass@localhost:5432/testdb',
          query: 'INSERT INTO synced_data (id, name, value, synced_at) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE SET name=$2, value=$3, synced_at=$4'
        }
      }
    ]
  },
  {
    id: 'parallel-processing-demo',
    name: '⚡ Parallel Processing Demo',
    description: 'API call → Email + SMS + Database update (all in parallel)',
    category: 'performance',
    trigger: {
      type: 'manual'
    },
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Fetch User Data',
          method: 'GET',
          url: 'https://httpbin.org/json'
        }
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Send Welcome Email',
          from: '',
          to: 'user@example.com',
          subject: 'Welcome!',
          text: 'Welcome to our platform!'
        },
        connections: [{ to: 'node_3', port: 'output' }]
      },
      {
        tool: 'twilio', 
        config: {
          name: 'Send SMS Alert',
          to: '+1234567890',
          body: 'Account created successfully!'
        },
        connections: [{ to: 'node_3', port: 'output' }]
      },
      {
        tool: 'database',
        config: {
          name: 'Log Activity',
          operation: 'insert',
          table: 'activity_log',
          data: {
            action: 'user_signup',
            timestamp: '{{new Date().toISOString()}}'
          }
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
          condition: 'true'
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
  },
  {
    id: 'retry-with-delay',
    name: 'API Retry with Delay',
    description: 'Call API → If fails → Wait → Retry (loop)',
    category: 'monitoring',
    steps: [
      {
        tool: 'http',
        config: {
          name: 'Try API call',
          url: 'https://httpbin.org/json',
          method: 'GET'
        }
      },
      {
        tool: 'conditional',
        config: {
          name: 'Check if successful',
          condition: '{{node_0.status}} == 200'
        },
        connections: [
          { port: 'true', to: 'node_4' },
          { port: 'false', to: 'node_2' }
        ]
      },
      {
        tool: 'delay',
        config: {
          name: 'Wait 5 seconds',
          seconds: 5
        }
      },
      {
        tool: 'http',
        config: {
          name: 'Retry API call',
          url: 'https://httpbin.org/json',
          method: 'GET'
        },
        connections: [
          { port: 'output', to: 'node_1' }
        ]
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Success notification',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
          to: 'team@yourcompany.com',
          subject: 'API Call Succeeded',
          text: 'API call completed successfully after retries'
        }
      }
    ]
  },
  {
    id: 'batch-processor',
    name: 'Batch Data Processor',
    description: 'Fetch records → Process each → Loop until done',
    category: 'data',
    steps: [
      {
        tool: 'database',
        config: {
          name: 'Get unprocessed records',
          connection_string: 'postgresql://user:pass@localhost:5432/testdb',
          query: 'SELECT * FROM queue WHERE processed = false LIMIT 10'
        }
      },
      {
        tool: 'conditional',
        config: {
          name: 'Check if records exist',
          condition: 'node_0.rows && node_0.rows.length > 0'
        },
        connections: [
          { port: 'true', to: 'node_2' },
          { port: 'false', to: 'node_5' }
        ]
      },
      {
        tool: 'transform',
        config: {
          name: 'Process records',
          script: `return {
  processed: node_0.rows.map(row => ({
    id: row.id,
    result: row.data.toUpperCase(),
    processed_at: new Date().toISOString()
  }))
};`
        }
      },
      {
        tool: 'database',
        config: {
          name: 'Mark as processed',
          connection_string: 'postgresql://user:pass@localhost:5432/testdb',
          query: 'UPDATE queue SET processed = true WHERE id = ANY($1)'
        }
      },
      {
        tool: 'delay',
        config: {
          name: 'Wait before next batch',
          seconds: 2
        },
        connections: [
          { port: 'output', to: 'node_0' }
        ]
      },
      {
        tool: 'sendgrid',
        config: {
          name: 'Completion notification',
          from: '', // Leave empty to use platform email (or add your SendGrid key in Settings)
          to: 'admin@yourcompany.com',
          subject: 'Batch Processing Complete',
          text: 'All records have been processed'
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
