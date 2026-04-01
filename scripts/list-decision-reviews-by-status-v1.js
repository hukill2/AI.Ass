// Usage: node scripts/list-decision-reviews-by-status-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');
const STATUSES = ['pending', 'reviewed', 'approved', 'rejected'];

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
  console.log(`Total decision reviews: ${reviews.length}`);
  const grouped = STATUSES.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {});
  reviews.forEach((review) => {
    const status = (review.operator_status || 'pending').toLowerCase();
    if (!grouped[status]) {
      grouped[status] = [];
    }
    grouped[status].push(review);
  });
  STATUSES.forEach((status) => {
    const entries = grouped[status] || [];
    console.log(`\n${status} (${entries.length})`);
    if (entries.length === 0) {
      console.log('  (none)');
      return;
    }
    entries.forEach((review) => {
      console.log(
        `  - ${review.review_id} decision=${review.decision_id} task=${review.task_id} classification=${review.classification} action=${review.recommended_action} status=${review.operator_status}`
      );
    });
  });
}

main();
