import fetch from "node-fetch";
import pg from "pg";
import OpenAI from "openai";
import { renderTemplate } from "./templating.js";
import { generateWebhookSignature } from "./webhooks.js";

const { Pool } = pg;

export async function executeHttpTool(config, context) {
  const url = renderTemplate(config.url, context);
  const method = config.method || "GET";
  const headers = config.headers || {};
  const body = config.body ? renderTemplate(JSON.stringify(config.body), context) : undefined;

  console.log(`HTTP ${method} ${url}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await res.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    
    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    }
    
    return { status: res.status, data };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`HTTP request to ${url} timed out after 30s`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeWebhookTool(config, context) {
  const url = renderTemplate(config.url, context);
  const method = config.method || "POST";
  const payload = config.payload || config.body || context;
  const body = JSON.stringify(payload);
  
  // Generate HMAC signature if secret provided
  const headers = { "Content-Type": "application/json", ...(config.headers || {}) };
  if (config.webhook_secret) {
    headers['X-Webhook-Signature'] = generateWebhookSignature(payload, config.webhook_secret);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await res.text();
    
    let response;
    try {
      response = JSON.parse(text);
    } catch {
      response = text;
    }
    
    return { status: res.status, response };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeDelayTool(config, context) {
  const seconds = config.seconds || 1;
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  return { delayed: seconds };
}

export async function executeConditionalTool(config, context) {
  const condition = config.condition; // e.g., "{{user.status}} === 'active'"
  const rendered = renderTemplate(condition, context);
  
  // Simple evaluation - supports basic comparisons
  let result = false;
  try {
    // Safe eval for simple conditions
    result = eval(rendered);
  } catch (e) {
    throw new Error(`Invalid condition: ${condition}`);
  }
  
  return { 
    condition: rendered,
    result: result,
    branch: result ? 'then' : 'else'
  };
}

export async function executeTransformTool(config, context) {
  const operations = config.operations || [];
  let result = {};
  
  for (const op of operations) {
    if (op.type === "extract") {
      // Extract value from context using template
      const value = renderTemplate(op.path, context);
      result[op.key] = value;
    }
    
    if (op.type === "map") {
      // Map array values - get array from context
      const arrayTemplate = op.array;
      const keys = arrayTemplate.replace(/^{{|}}/g, '').trim().split('.');
      let array = context;
      for (const key of keys) {
        array = array?.[key.trim()];
      }
      
      if (Array.isArray(array)) {
        result[op.key] = array.map(item => {
          const mapped = {};
          for (const [newKey, path] of Object.entries(op.mapping)) {
            const itemKeys = path.split('.');
            let value = item;
            for (const k of itemKeys) {
              value = value?.[k];
            }
            mapped[newKey] = value;
          }
          return mapped;
        });
      }
    }
    
    if (op.type === "template") {
      // Simple string template
      result[op.key] = renderTemplate(op.template, context);
    }
  }
  
  return result;
}

export async function executeDatabaseTool(config, context) {
  const connectionString = config.connection_string || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("No database connection string provided");
  }
  
  const pool = new Pool({
    connectionString,
    ssl: config.ssl !== false ? { rejectUnauthorized: false } : false
  });
  
  try {
    const query = renderTemplate(config.query, context);
    const params = config.params ? config.params.map(p => renderTemplate(String(p), context)) : [];
    
    const result = await pool.query(query, params);
    
    return {
      rows: result.rows,
      rowCount: result.rowCount,
      command: result.command
    };
  } finally {
    await pool.end();
  }
}

export async function executeSendGridTool(config, context) {
  const apiKey = config.api_key || context._workspace?.sendgrid_api_key || process.env.PLATFORM_SENDGRID_API_KEY;
  if (!apiKey) {
    console.error('SendGrid key check:', {
      hasConfigKey: !!config.api_key,
      hasWorkspace: !!context._workspace,
      hasWorkspaceKey: !!context._workspace?.sendgrid_api_key,
      hasEnvKey: !!process.env.PLATFORM_SENDGRID_API_KEY
    });
    throw new Error('SendGrid API key required. Add it in Settings or tool config.');
  }
  
  const to = renderTemplate(config.to, context);
  const from = renderTemplate(config.from, context) || process.env.PLATFORM_SENDGRID_FROM_EMAIL;
  const subject = renderTemplate(config.subject, context);
  const text = renderTemplate(config.text || '', context);
  const html = config.html ? renderTemplate(config.html, context) : undefined;
  
  console.log('SendGrid sending:', { to, from, subject });
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: from },
        subject,
        content: [
          html ? { type: 'text/html', value: html } : { type: 'text/plain', value: text }
        ]
      }),
      signal: controller.signal
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error('SendGrid error:', error);
      throw new Error(`SendGrid error: ${error}`);
    }
    
    const messageId = response.headers.get('x-message-id');
    console.log('SendGrid success:', { status: response.status, messageId });
    
    return { 
      status: response.status,
      messageId
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeLLMTool(config, context) {
  const provider = config.provider || 'openai';
  const prompt = renderTemplate(config.prompt, context);
  const model = config.model || (provider === 'openai' ? 'gpt-4o-mini' : 'claude-3-5-sonnet-20241022');
  const temperature = config.temperature || 0.7;
  const maxTokens = config.max_tokens || 1000;
  
  // Priority: tool config > workspace key > env var
  const apiKey = config.api_key || context._workspace?.llm_api_key || process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM API key required. Add it in Settings or tool config.');
  
  if (provider === 'openai') {
    const openai = new OpenAI({ apiKey });
    
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: config.system_prompt || 'You are a helpful assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature,
      max_tokens: maxTokens
    });
    
    return {
      content: response.choices[0].message.content,
      model: response.model,
      usage: response.usage,
      provider: 'openai'
    };
  }
  
  if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system: config.system_prompt || 'You are a helpful assistant.',
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }
    
    const data = await response.json();
    return {
      content: data.content[0].text,
      model: data.model,
      usage: data.usage,
      provider: 'anthropic'
    };
  }
  
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

export async function executeTwilioTool(config, context) {
  const accountSid = config.account_sid || context._workspace?.twilio_account_sid || process.env.PLATFORM_TWILIO_ACCOUNT_SID;
  const authToken = config.auth_token || context._workspace?.twilio_auth_token || process.env.PLATFORM_TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials required. Add them in Settings or tool config.');
  }
  
  const from = renderTemplate(config.from, context) || process.env.PLATFORM_TWILIO_FROM_PHONE;
  const to = renderTemplate(config.to, context);
  const body = renderTemplate(config.body, context);
  
  if (!from) {
    throw new Error('From phone number required. Set in tool config or add PLATFORM_TWILIO_FROM_PHONE.');
  }
  
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ From: from, To: to, Body: body }),
      signal: controller.signal
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio error: ${error}`);
    }
    
    const data = await response.json();
    return {
      sid: data.sid,
      status: data.status,
      to: data.to,
      from: data.from
    };
  } finally {
    clearTimeout(timeout);
  }
}
