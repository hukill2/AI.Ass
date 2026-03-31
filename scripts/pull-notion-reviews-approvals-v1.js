// Usage: node scripts/pull-notion-reviews-approvals-v1.js
const path = require('path');

const docsPath = path.join(__dirname, '..', 'docs', 'notion-pull-contract-v1.md');
const sourceName = 'Reviews / Approvals database';
const outputTarget = path.join(__dirname, '..', 'mirror', 'reviews-approvals-source.v1.json');
const envVars = ['NOTION_API_KEY', 'NOTION_REVIEWS_DATABASE_ID'];

console.log('Notion pull v1 is not implemented yet.');
console.log(`Reference spec: ${docsPath}`);
console.log(`Intended source: ${sourceName}`);
console.log(`Intended output: ${outputTarget}`);

envVars.forEach((name) => {
  const value = process.env[name];
  console.log(`${name}: ${value ? 'set' : 'missing'}`);
});

console.log('Stub complete; no Notion calls executed.');
process.exit(0);
