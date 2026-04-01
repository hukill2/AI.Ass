// Usage: node scripts/resolve-approval-candidate-v1.js --review-id <id> --action <approve|reject> [--notes "<text>"]
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');
const ACTION_MAP = {
  approve: 'approved',
  reject: 'rejected',
};

function exitWith(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!value || value.startsWith('--')) exitWith(`Missing value for ${key}`);
    if (key === '--review-id') out.reviewId = value;
    else if (key === '--action') out.action = value.toLowerCase();
    else if (key === '--notes') out.notes = value;
    else exitWith(`Unknown argument ${key}`);
  }
  if (!out.reviewId) exitWith('Missing --review-id');
  if (!out.action) exitWith('Missing --action');
  if (!ACTION_MAP[out.action]) exitWith('Allowed actions: approve, reject');
  return out;
}

function loadData() {
  if (!fs.existsSync(FILE_PATH)) exitWith(`Missing file: ${FILE_PATH}`);
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitWith(`Failed to parse ${FILE_PATH}: ${err.message}`);
  }
}

function main() {
  const { reviewId, action, notes } = parseArgs();
  const data = loadData();
  if (!data || data.version !== 'v1' || !Array.isArray(data.reviews)) {
    exitWith('Decision reviews store invalid.');
  }
  const review = data.reviews.find((r) => r.review_id === reviewId);
  if (!review) exitWith(`Review ${reviewId} not found.`);
  if (review.classification !== 'approval-required') exitWith('Review is not approval-required.');
  if (review.operator_status !== 'reviewed') exitWith('Review must be in reviewed status.');
  const oldStatus = review.operator_status;
  review.operator_status = ACTION_MAP[action];
  if (notes) review.operator_notes = notes;
  review.updated_at = new Date().toISOString();
  fs.writeFileSync(FILE_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log('Review updated:', reviewId);
  console.log('Old status:', oldStatus);
  console.log('New status:', review.operator_status);
  console.log('Action:', action);
  console.log('Notes updated:', Boolean(notes));
}

main();
