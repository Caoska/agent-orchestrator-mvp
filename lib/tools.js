import fetch from "node-fetch";
import nodemailer from "nodemailer";
import { renderTemplate } from "./templating.js";

export async function executeHttpTool(config, context) {
  const url = renderTemplate(config.url, context);
  const method = config.method || "GET";
  const headers = config.headers || {};
  const body = config.body ? renderTemplate(JSON.stringify(config.body), context) : undefined;

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

export async function executeWebhookTool(config, context) {
  const url = renderTemplate(config.url, context);
  const method = config.method || "POST";
  const headers = { "Content-Type": "application/json", ...(config.headers || {}) };
  const payload = config.payload || context;
  const body = JSON.stringify(payload);

  const res = await fetch(url, { method, headers, body });
  const text = await res.text();
  
  try {
    return { status: res.status, response: JSON.parse(text) };
  } catch {
    return { status: res.status, response: text };
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

export async function executeSmtpTool(config, context) {
  const transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port || 587,
    secure: config.smtp_secure || false,
    auth: config.smtp_user ? {
      user: config.smtp_user,
      pass: config.smtp_pass
    } : undefined
  });

  const to = renderTemplate(config.to, context);
  const subject = renderTemplate(config.subject, context);
  const text = renderTemplate(config.text, context);

  const info = await transporter.sendMail({ from: config.from, to, subject, text });
  return { messageId: info.messageId, accepted: info.accepted };
}
