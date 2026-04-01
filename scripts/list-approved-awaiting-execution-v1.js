// Usage: node scripts/list-approved-awaiting-execution-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) {
    throw new Error(`Missing file: ${FILE_PATH}`);
  }
  return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
}

function main() {
  let data;
  try {
    data = loadJson();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const candidates = reviews.filter(
    (review) => review.classification === 'approval-required' && review.operator_status === 'approved'
  );
  console.log(`Total approved-awaiting-execution items: ${candidates.length}`);
  if (!candidates.length) {
    console.log('No approval-required reviews are explicitly approved yet.');
    return;
  }
  candidates.forEach((entry) => {
    console.log(
      `- ${entry.review_id} decision=${entry.decision_id} task=${entry.task_id} classification=${entry.classification} action=${entry.recommended_action} status=${entry.operator_status} notes=${entry.operator_notes || '<none>'}`
    );
  });
}

main();
