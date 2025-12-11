export const TEMPLATES = [
  {
    id: 'api-status-check',
    name: 'API Status Check',
    description: 'Check if an API is responding successfully',
    category: 'monitoring',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.github.com/zen',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'weather-check',
    name: 'Weather Check',
    description: 'Get current weather data for Seattle',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://wttr.in/Seattle?format=j1',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'github-user',
    name: 'GitHub User Info',
    description: 'Fetch public GitHub user information',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.github.com/users/github',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'crypto-price',
    name: 'Cryptocurrency Price',
    description: 'Get current Bitcoin price in USD',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.coinbase.com/v2/prices/BTC-USD/spot',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'api-error-slack',
    name: 'API Error Alert to Slack',
    description: 'Monitor an API and send Slack alert on error',
    category: 'monitoring',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.github.com/users/github',
          method: 'GET'
        }
      },
      {
        type: 'webhook',
        config: {
          url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
          method: 'POST',
          body: {
            text: 'API check completed with status: {{step0.status}}'
          }
        }
      }
    ]
  },
  {
    id: 'stripe-to-notion',
    name: 'Sync Stripe to Notion',
    description: 'Fetch Stripe data and update Notion database',
    category: 'sync',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.stripe.com/v1/subscriptions',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer sk_test_YOUR_KEY'
          }
        }
      },
      {
        type: 'http',
        config: {
          url: 'https://api.notion.com/v1/pages',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer secret_YOUR_NOTION_KEY',
            'Notion-Version': '2022-06-28'
          },
          body: {
            parent: { database_id: 'YOUR_DATABASE_ID' },
            properties: {}
          }
        }
      }
    ]
  },
  {
    id: 'rss-to-discord',
    name: 'RSS Feed to Discord',
    description: 'Post new RSS items to Discord channel',
    category: 'notifications',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://example.com/feed.xml',
          method: 'GET'
        }
      },
      {
        type: 'webhook',
        config: {
          url: 'https://discord.com/api/webhooks/YOUR/WEBHOOK',
          method: 'POST',
          body: {
            content: 'New RSS item posted'
          }
        }
      }
    ]
  },
  {
    id: 'webhook-to-database',
    name: 'Webhook to Database',
    description: 'Receive webhook and log to database',
    category: 'data',
    steps: [
      {
        type: 'database',
        config: {
          connection_string: 'postgresql://user:pass@host:5432/db',
          query: 'INSERT INTO logs (data, created_at) VALUES ($1, NOW())',
          params: ['{{_trigger.body}}']
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
