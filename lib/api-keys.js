// Helper functions for working with the new api_keys JSON format

/**
 * Get an API key from the workspace's api_keys JSON or fallback to old columns
 * @param {Object} workspace - The workspace object
 * @param {string} keyType - The type of key ('llm', 'sendgrid', 'twilio')
 * @param {string} subKey - For nested keys like twilio.account_sid
 * @returns {string|null} The API key or null if not found
 */
export function getApiKey(workspace, keyType, subKey = null) {
  if (!workspace) return null;

  // Try new JSON format first
  if (workspace.api_keys && typeof workspace.api_keys === 'object') {
    const keys = workspace.api_keys;
    
    if (subKey && keys[keyType] && typeof keys[keyType] === 'object') {
      return keys[keyType][subKey] || null;
    }
    
    if (!subKey && keys[keyType]) {
      return keys[keyType];
    }
  }

  // Fallback to old column format
  switch (keyType) {
    case 'llm':
      return workspace.llm_api_key || null;
    case 'sendgrid':
      return workspace.sendgrid_api_key || null;
    case 'twilio':
      if (subKey === 'account_sid') return workspace.twilio_account_sid || null;
      if (subKey === 'auth_token') return workspace.twilio_auth_token || null;
      return null;
    default:
      return null;
  }
}

/**
 * Set an API key in the workspace's api_keys JSON format
 * @param {Object} apiKeys - Current api_keys object (will be modified)
 * @param {string} keyType - The type of key ('llm', 'sendgrid', 'twilio')
 * @param {string|Object} value - The API key value or object for nested keys
 * @param {string} subKey - For nested keys like twilio.account_sid
 */
export function setApiKey(apiKeys, keyType, value, subKey = null) {
  if (!apiKeys || typeof apiKeys !== 'object') {
    apiKeys = {};
  }

  if (subKey) {
    if (!apiKeys[keyType] || typeof apiKeys[keyType] !== 'object') {
      apiKeys[keyType] = {};
    }
    apiKeys[keyType][subKey] = value;
  } else {
    apiKeys[keyType] = value;
  }

  return apiKeys;
}

/**
 * Remove an API key from the workspace's api_keys JSON format
 * @param {Object} apiKeys - Current api_keys object (will be modified)
 * @param {string} keyType - The type of key to remove
 * @param {string} subKey - For nested keys like twilio.account_sid
 */
export function removeApiKey(apiKeys, keyType, subKey = null) {
  if (!apiKeys || typeof apiKeys !== 'object') {
    return apiKeys;
  }

  if (subKey && apiKeys[keyType] && typeof apiKeys[keyType] === 'object') {
    delete apiKeys[keyType][subKey];
    // Remove parent object if empty
    if (Object.keys(apiKeys[keyType]).length === 0) {
      delete apiKeys[keyType];
    }
  } else if (!subKey) {
    delete apiKeys[keyType];
  }

  return apiKeys;
}

/**
 * Get all API keys for a workspace in a standardized format
 * @param {Object} workspace - The workspace object
 * @returns {Object} Standardized API keys object
 */
export function getAllApiKeys(workspace) {
  if (!workspace) return {};

  return {
    llm: getApiKey(workspace, 'llm'),
    sendgrid: getApiKey(workspace, 'sendgrid'),
    twilio: {
      account_sid: getApiKey(workspace, 'twilio', 'account_sid'),
      auth_token: getApiKey(workspace, 'twilio', 'auth_token')
    }
  };
}

/**
 * Check if a workspace has any API keys configured
 * @param {Object} workspace - The workspace object
 * @returns {boolean} True if any API keys are configured
 */
export function hasApiKeys(workspace) {
  const keys = getAllApiKeys(workspace);
  return !!(keys.llm || keys.sendgrid || keys.twilio.account_sid || keys.twilio.auth_token);
}
