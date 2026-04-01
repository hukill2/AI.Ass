// Usage: node scripts/promote-approved-review-to-execution-candidate-v1.js
const fs = require('fs');
const path = require('path');

const DECISIONS_PATH = path.join(__dirname, '..', 'runtime', 'assistant-decisions.v1.json');
const REVIEWS_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');
const CANDIDATES_PATH = path.join(__dirname, '..', 'runtime', 'execution-candidates.v1.json');

function exitWith(message) {
  console.error(message);
  process.exit(1);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) exitWith(`Missing file: ${filePath}`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    exitWith(`Failed to parse ${filePath}: ${err.message}`);
  }
}

function isDecisionComplete(decision) {
  return (
    decision &&
    decision.recommended_next_step &&
    decision.reasoning &&
    Array.isArray(decision.files_to_create_or_update) &&
    Array.isArray(decision.risks_or_guardrails)
  );
}

function main() {
  const args = process.argv.slice(2);
  const reviewIdIndex = args.indexOf('--review-id');
  const requestedReviewId = reviewIdIndex >= 0 ? args[reviewIdIndex + 1] : undefined;
  const reviewsData = loadJson(REVIEWS_PATH);
  const decisionsData = loadJson(DECISIONS_PATH);
  const candidatesData = loadJson(CANDIDATES_PATH);

  if (
    !reviewsData ||
    reviewsData.version !== 'v1' ||
    !Array.isArray(reviewsData.reviews) ||
    !decisionsData ||
    !Array.isArray(decisionsData.decisions) ||
    !candidatesData ||
    candidatesData.version !== 'v1' ||
    !Array.isArray(candidatesData.candidates)
  ) {
    exitWith('One of the source stores is invalid.');
  }

  const promoted = [];

  const targets = requestedReviewId
    ? reviewsData.reviews.filter((review) => review.review_id === requestedReviewId)
    : reviewsData.reviews;

  if (requestedReviewId && !targets.length) {
    exitWith(`Review ${requestedReviewId} not found.`);
  }

  targets.forEach((review) => {
    if (!['approval-required', 'review-required'].includes(review.classification) || review.operator_status !== 'approved') {
      return;
    }
    if (candidatesData.candidates.some((candidate) => candidate.review_id === review.review_id)) {
      return;
    }
    const decision = decisionsData.decisions.find((d) => d.decision_id === review.decision_id);
    const executionStatus = decision && isDecisionComplete(decision)
      ? 'awaiting_execution'
      : 'execution_blocked';
    promoted.push(review.review_id);
    const candidate = {
      execution_id: `exec-${Date.now()}-${promoted.length}`,
      review_id: review.review_id,
      decision_id: review.decision_id,
      task_id: review.task_id,
      execution_status: executionStatus,
      recommended_next_step: (decision && decision.recommended_next_step) || '',
      files_to_create_or_update: (decision && decision.files_to_create_or_update) || [],
      reasoning: (decision && decision.reasoning) || '',
      risks_or_guardrails: (decision && decision.risks_or_guardrails) || [],
      operator_notes: review.operator_notes || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    candidatesData.candidates.push(candidate);
  });

  fs.writeFileSync(CANDIDATES_PATH, `${JSON.stringify(candidatesData, null, 2)}\n`);
  console.log('Promoted reviews:', promoted);
  console.log('Total execution candidates:', candidatesData.candidates.length);
}

main();
