// Usage: node scripts/latest-decision-review-summary-v1.js
const fs = require('fs');
const path = require('path');

const DECISIONS_PATH = path.join(__dirname, '..', 'runtime', 'assistant-decisions.v1.json');
const REVIEWS_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing file: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  let decisions, reviews;
  try {
    decisions = readJson(DECISIONS_PATH);
    reviews = readJson(REVIEWS_PATH);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const decisionList = Array.isArray(decisions.decisions) ? decisions.decisions : [];
  if (!decisionList.length) {
    console.log('No assistant decisions available.');
    return;
  }
  const latestDecision = decisionList[decisionList.length - 1];
  const reviewList = Array.isArray(reviews.reviews) ? reviews.reviews : [];
  const latestReview = reviewList
    .filter((review) => review.decision_id === latestDecision.decision_id)
    .slice(-1)[0];

  console.log('--- Latest Decision & Review Summary ---');
  console.log(`Decision ID: ${latestDecision.decision_id}`);
  console.log(`Task ID: ${latestDecision.task_id}`);
  console.log(`Model: ${latestDecision.model}`);
  console.log(`Recommended next step: ${latestDecision.recommended_next_step}`);
  if (latestReview) {
    console.log(`Classification: ${latestReview.classification}`);
    console.log(`Recommended action: ${latestReview.recommended_action}`);
    console.log(`Operator status: ${latestReview.operator_status}`);
    console.log(`Operator notes: ${latestReview.operator_notes || '<none>'}`);
  } else {
    console.log('No matching review record found for this decision.');
  }
}

main();
