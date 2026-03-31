// Usage: node scripts/reviews-approvals-quality-report-v1.js
const fs = require('fs');
const path = require('path');

const SOURCE_PATH = path.join(__dirname, '..', 'mirror', 'reviews-approvals-source.v1.json');
const RECOMMENDED_SECTIONS = [
  'summary',
  'full_context',
  'proposed_action',
  'why_this_was_triggered',
  'risk_assessment',
  'suggested_route',
  'affected_components',
  'operator_notes',
  'revised_instructions',
  'final_outcome',
];

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function loadSource() {
  if (!fs.existsSync(SOURCE_PATH)) {
    exitWithError(`Missing reviews source: ${SOURCE_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
  } catch (err) {
    exitWithError(`Failed to parse reviews source: ${err.message}`);
  }
}

function summarizeNarrative(body) {
  if (!body || typeof body !== 'object') {
    return { missing: [...RECOMMENDED_SECTIONS] };
  }
  const missing = [];
  RECOMMENDED_SECTIONS.forEach((section) => {
    const value = String(body[section] || '').trim();
    if (!value) {
      missing.push(section);
    }
  });
  return { missing };
}

function report() {
  const data = loadSource();
  const items = Array.isArray(data.items) ? data.items : [];
  console.log('--- Reviews / Approvals Quality Report ---');
  console.log(`Total items: ${items.length}`);
  const warnings = [];
  items.forEach((item) => {
    const { missing } = summarizeNarrative(item.body);
    if (missing.length > 0) {
      warnings.push({ title: item.title || '<untitled>', task_id: item.task_id || '<no task_id>', missing });
    }
  });
  console.log(`Items missing recommended narrative sections: ${warnings.length}`);
  warnings.forEach((warn) => {
    console.log(`  - ${warn.title} (${warn.task_id}): ${warn.missing.join(', ')}`);
  });
  console.log('Structure vs quality: required structured fields still gate sync; narrative gaps are warnings, not failures.');
}

report();
