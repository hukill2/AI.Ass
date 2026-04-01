// Usage: node scripts/update-decision-review-status-v1.js --review-id <id> --status <status> [--notes "<text>"]
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');
const ALLOWED_STATUSES = new Set(['pending', 'reviewed', 'approved', 'rejected']);
const TRANSITIONS = {
  pending: new Set(['reviewed']),
  reviewed: new Set(['approved', 'rejected']),
};

function exitWith(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    const value = args[i + 1];
    if (!value || value.startsWith('--')) {
      exitWith(`Missing value for ${key}`);
    }
    if (key === '--review-id') result.reviewId = value;
    else if (key === '--status') result.status = value.toLowerCase();
    else if (key === '--notes') result.notes = value;
    else exitWith(`Unknown argument ${key}`);
  }
  if (!result.reviewId) exitWith('Missing --review-id');
  if (!result.status) exitWith('Missing --status');
  if (!ALLOWED_STATUSES.has(result.status)) {
    exitWith(`Invalid status ${result.status}`);
  }
  return result;
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
  const { reviewId, status, notes } = parseArgs();
  const data = loadData();
  if (!data || data.version !== 'v1' || !Array.isArray(data.reviews)) exitWith('Decision reviews store invalid.');
  const review = data.reviews.find((entry) => entry.review_id === reviewId);
  if (!review) exitWith(`Review ${reviewId} not found.`);
  const oldStatus = review.operator_status;
  if (oldStatus === status) {
    exitWith(`Review ${reviewId} is already ${status}.`);
  }
  if (!TRANSITIONS[oldStatus] || !TRANSITIONS[oldStatus].has(status)) {
    exitWith(`Transition ${oldStatus} -> ${status} is not allowed.`);
  }
  review.operator_status = status;
  if (notes) review.operator_notes = notes;
  review.updated_at = new Date().toISOString();
  fs.writeFileSync(FILE_PATH, `${JSON.stringify(data, null, 2)}\n`);
  console.log('Review updated:', reviewId);
  console.log('Old status:', oldStatus);
  console.log('New status:', status);
  console.log('Notes updated:', Boolean(notes));
}

main();
