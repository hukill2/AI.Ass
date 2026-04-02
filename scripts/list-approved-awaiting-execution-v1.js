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

const CANDIDATES_PATH = path.join(__dirname, '..', 'runtime', 'execution-candidates.v1.json');

function loadCandidates() {
  if (!fs.existsSync(CANDIDATES_PATH)) {
    throw new Error(`Missing file: ${CANDIDATES_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CANDIDATES_PATH, 'utf8')).candidates || [];
}

function main() {
  let reviews;
  let candidates;
  try {
    reviews = loadJson().reviews || [];
    candidates = loadCandidates();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const reviewMap = new Map();
  reviews.forEach((review) => {
    reviewMap.set(review.review_id, review);
  });
  const matches = candidates.filter((candidate) => {
    const review = reviewMap.get(candidate.review_id);
    return (
      review &&
      ['approval-required', 'review-required'].includes(review.classification) &&
      review.operator_status === 'approved' &&
      candidate.execution_status === 'awaiting_execution'
    );
  });
  console.log(`Total approved-awaiting-execution items: ${matches.length}`);
  if (!matches.length) {
    console.log('No approved reviews currently awaiting execution.');
    return;
  }
  matches.forEach((candidate) => {
    const review = reviewMap.get(candidate.review_id);
    console.log(
      `- ${candidate.execution_id} review=${candidate.review_id} decid=${candidate.decision_id} task=${candidate.task_id} status=${candidate.execution_status} recommended_next_step=${candidate.recommended_next_step}`
    );
    if (review) {
      console.log(`  review notes: classification=${review.classification} operator_status=${review.operator_status}`);
    }
  });
}

main();
