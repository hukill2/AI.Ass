// Usage: node scripts/classify-assistant-decision-v1.js
const fs = require('fs');
const path = require('path');

const DECISIONS_PATH = path.join(__dirname, '..', 'runtime', 'assistant-decisions.v1.json');
const REVIEWS_PATH = path.join(__dirname, '..', 'runtime', 'decision-reviews.v1.json');

function exitWithError(message) {
  console.error(message);
  process.exit(1);
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    exitWithError(`Missing file: ${filePath}`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    exitWithError(`Failed to parse ${filePath}: ${err.message}`);
  }
}

function isAnalysisOnly(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return /analysis|gather context|analysis-only|review|research|investigate/.test(lower);
}

function suggestsRulesChange(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return /(guardrails|routing|approvals|architecture|integration|execution)/.test(lower);
}

function classifyDecision(decision) {
  const recommended = (decision.recommended_next_step || '').trim();
  const files = Array.isArray(decision.files_to_create_or_update) ? decision.files_to_create_or_update : [];
  if (isAnalysisOnly(recommended) && files.length === 0) {
    return 'informational';
  }
  if (suggestsRulesChange(recommended) || suggestsRulesChange(decision.reasoning)) {
    return 'approval-required';
  }
  if (files.length > 0) {
    return 'review-required';
  }
  return 'review-required';
}

function main() {
  const decisionsData = loadJson(DECISIONS_PATH);
  if (!decisionsData || !Array.isArray(decisionsData.decisions) || decisionsData.decisions.length === 0) {
    exitWithError('No assistant decisions available for review.');
  }
  const latest = decisionsData.decisions[decisionsData.decisions.length - 1];
  const classification = classifyDecision(latest);
  const actionMap = {
    informational: 'store-only',
    'review-required': 'review-before-execution',
    'approval-required': 'explicit-approval-required',
  };
  const reviewData = loadJson(REVIEWS_PATH);
  if (!reviewData || reviewData.version !== 'v1' || !Array.isArray(reviewData.reviews)) {
    exitWithError('Invalid decision reviews store.');
  }
  const now = new Date().toISOString();
  const reviewRecord = {
    review_id: `review-${Date.now()}`,
    decision_id: latest.decision_id || '',
    task_id: latest.task_id || '',
    classification,
    recommended_action: actionMap[classification] || 'review-before-execution',
    operator_status: 'pending',
    operator_notes: '',
    created_at: now,
    updated_at: now,
  };
  reviewData.reviews.push(reviewRecord);
  fs.writeFileSync(REVIEWS_PATH, `${JSON.stringify(reviewData, null, 2)}\n`);
  console.log('Classified decision:', latest.decision_id || '<missing>');
  console.log('Classification:', classification);
  console.log('Recommended action:', reviewRecord.recommended_action);
  console.log('Total review records:', reviewData.reviews.length);
}

main();
