#!/usr/bin/env node

// Convert all templates from steps to nodes/connections format

import fs from 'fs';
import { TEMPLATES } from './lib/templates.js';

function convertStepsToNodes(template) {
  if (template.nodes && template.connections) {
    return template; // Already converted
  }
  
  if (!template.steps) {
    console.warn(`Template ${template.id} has no steps or nodes`);
    return template;
  }

  const nodes = template.steps.map((step, idx) => ({
    id: `node_${idx}`,
    type: step.tool,
    config: step.config
  }));

  const connections = [];
  for (let i = 0; i < template.steps.length - 1; i++) {
    connections.push({
      from: `node_${i}`,
      to: `node_${i + 1}`
    });
  }

  const converted = {
    ...template,
    nodes,
    connections
  };
  
  delete converted.steps;
  return converted;
}

const convertedTemplates = TEMPLATES.map(convertStepsToNodes);

// Generate new templates.js file
const output = `export const TEMPLATES = ${JSON.stringify(convertedTemplates, null, 2)};

export function getTemplatesByCategory(category) {
  return TEMPLATES.filter(t => t.category === category);
}

export function getAllCategories() {
  return [...new Set(TEMPLATES.map(t => t.category))];
}
`;

fs.writeFileSync('./lib/templates-converted.js', output);
console.log('✅ All templates converted to nodes/connections format');
console.log(`Converted ${convertedTemplates.length} templates`);
console.log('Output written to lib/templates-converted.js');
