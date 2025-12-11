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
          url: 'https://httpbin.org/status/200',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'fetch-random-fact',
    name: 'Fetch Random Fact',
    description: 'Get a random fact from a public API',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://uselessfacts.jsph.pl/random.json?language=en',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'weather-check',
    name: 'Weather Check',
    description: 'Get current weather data for a location',
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
    id: 'ip-info',
    name: 'IP Information Lookup',
    description: 'Get information about an IP address',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://ipapi.co/8.8.8.8/json/',
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
    id: 'joke-generator',
    name: 'Random Joke Generator',
    description: 'Get a random programming joke',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://official-joke-api.appspot.com/random_joke',
          method: 'GET'
        }
      }
    ]
  },
  {
    id: 'api-error-slack',
    name: 'API Error Alert to Slack',
    description: 'Monitor an API endpoint and send Slack alert when it returns an error',
    category: 'monitoring',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.example.com/health',
          method: 'GET'
        }
      },
      {
        type: 'conditional',
        config: {
          condition: '{{step0.status}} >= 400',
          true_branch: [
            {
              type: 'webhook',
              config: {
                url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL',
                method: 'POST',
                body: {
                  text: '🚨 API Error Detected',
                  blocks: [
                    {
                      type: 'section',
                      text: {
                        type: 'mrkdwn',
                        text: '*Status:* {{step0.status}}\n*Response:* {{step0.body}}'
                      }
                    }
                  ]
                }
              }
            }
          ],
          false_branch: []
        }
      }
    ]
  },
  {
    id: 'webpage-monitor-email',
    name: 'Webpage Change Monitor',
    description: 'Check a webpage for changes and send email notification',
    category: 'monitoring',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://example.com/page-to-monitor',
          method: 'GET'
        }
      },
      {
        type: 'database',
        config: {
          connection_string: 'postgresql://user:pass@host:5432/db',
          query: 'SELECT content FROM page_snapshots WHERE url = $1 ORDER BY created_at DESC LIMIT 1',
          params: ['https://example.com/page-to-monitor']
        }
      },
      {
        type: 'conditional',
        config: {
          condition: '{{step0.body}} !== {{step1.rows[0].content}}',
          true_branch: [
            {
              type: 'smtp',
              config: {
                host: 'smtp.gmail.com',
                port: 587,
                from: 'alerts@yourdomain.com',
                to: 'you@example.com',
                subject: 'Webpage Changed',
                body: 'The monitored page has changed.\n\nNew content: {{step0.body}}'
              }
            },
            {
              type: 'database',
              config: {
                connection_string: 'postgresql://user:pass@host:5432/db',
                query: 'INSERT INTO page_snapshots (url, content, created_at) VALUES ($1, $2, NOW())',
                params: ['https://example.com/page-to-monitor', '{{step0.body}}']
              }
            }
          ],
          false_branch: []
        }
      }
    ]
  },
  {
    id: 'stripe-to-notion',
    name: 'Sync Stripe Subscriptions to Notion',
    description: 'Fetch Stripe subscriptions and update Notion database',
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
        type: 'transform',
        config: {
          operation: 'map',
          path: '$.data',
          transform: {
            customer: '{{item.customer}}',
            status: '{{item.status}}',
            amount: '{{item.plan.amount}}',
            interval: '{{item.plan.interval}}'
          },
          output_key: 'subscriptions'
        }
      },
      {
        type: 'http',
        config: {
          url: 'https://api.notion.com/v1/pages',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer secret_YOUR_NOTION_KEY',
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: {
            parent: { database_id: 'YOUR_DATABASE_ID' },
            properties: {
              'Customer': { title: [{ text: { content: '{{subscriptions[0].customer}}' } }] },
              'Status': { select: { name: '{{subscriptions[0].status}}' } },
              'Amount': { number: '{{subscriptions[0].amount}}' }
            }
          }
        }
      }
    ]
  },
  {
    id: 'rss-to-discord',
    name: 'RSS Feed to Discord',
    description: 'Check RSS feed and post new items to Discord channel',
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
        type: 'transform',
        config: {
          operation: 'extract',
          path: '$.rss.channel.item[0]',
          output_key: 'latest_item'
        }
      },
      {
        type: 'webhook',
        config: {
          url: 'https://discord.com/api/webhooks/YOUR/WEBHOOK',
          method: 'POST',
          body: {
            content: '📰 New Post',
            embeds: [
              {
                title: '{{latest_item.title}}',
                description: '{{latest_item.description}}',
                url: '{{latest_item.link}}',
                color: 5814783
              }
            ]
          }
        }
      }
    ]
  },
  {
    id: 'daily-api-report',
    name: 'Daily API Report Email',
    description: 'Aggregate data from your API and send daily summary email',
    category: 'reporting',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.example.com/analytics/daily',
          method: 'GET',
          headers: {
            'Authorization': 'Bearer YOUR_API_KEY'
          }
        }
      },
      {
        type: 'transform',
        config: {
          operation: 'aggregate',
          path: '$.data',
          aggregations: {
            total_requests: 'sum(requests)',
            avg_response_time: 'avg(response_time)',
            error_rate: 'sum(errors) / sum(requests)'
          },
          output_key: 'stats'
        }
      },
      {
        type: 'smtp',
        config: {
          host: 'smtp.gmail.com',
          port: 587,
          from: 'reports@yourdomain.com',
          to: 'team@example.com',
          subject: 'Daily API Report - {{date}}',
          body: `Daily API Summary:
          
Total Requests: {{stats.total_requests}}
Avg Response Time: {{stats.avg_response_time}}ms
Error Rate: {{stats.error_rate}}%

Full report: https://dashboard.example.com`
        }
      }
    ]
  },
  {
    id: 'webhook-to-database',
    name: 'Webhook to Database Logger',
    description: 'Receive webhook and log data to database',
    category: 'data',
    steps: [
      {
        type: 'webhook',
        config: {
          url: 'https://your-domain.com/webhook',
          method: 'POST',
          body: {}
        }
      },
      {
        type: 'database',
        config: {
          connection_string: 'postgresql://user:pass@host:5432/db',
          query: 'INSERT INTO webhook_logs (payload, received_at) VALUES ($1, NOW())',
          params: ['{{step0.body}}']
        }
      }
    ]
  },
  {
    id: 'api-retry-pattern',
    name: 'API Call with Retry',
    description: 'Call API with automatic retry on failure',
    category: 'reliability',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://api.example.com/endpoint',
          method: 'POST',
          body: { data: 'value' },
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000
          }
        }
      },
      {
        type: 'conditional',
        config: {
          condition: '{{step0.status}} >= 400',
          true_branch: [
            {
              type: 'delay',
              config: { seconds: 5 }
            },
            {
              type: 'http',
              config: {
                url: 'https://api.example.com/endpoint',
                method: 'POST',
                body: { data: 'value' }
              }
            }
          ],
          false_branch: []
        }
      }
    ]
  },
  {
    id: 'data-transformation',
    name: 'API Data Transformation Pipeline',
    description: 'Fetch, transform, and forward data between APIs',
    category: 'data',
    steps: [
      {
        type: 'http',
        config: {
          url: 'https://source-api.com/data',
          method: 'GET'
        }
      },
      {
        type: 'transform',
        config: {
          operation: 'map',
          path: '$.items',
          transform: {
            id: '{{item.external_id}}',
            name: '{{item.full_name}}',
            email: '{{item.contact.email}}',
            created: '{{item.timestamp}}'
          },
          output_key: 'transformed'
        }
      },
      {
        type: 'http',
        config: {
          url: 'https://destination-api.com/import',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_KEY'
          },
          body: {
            records: '{{transformed}}'
          }
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
