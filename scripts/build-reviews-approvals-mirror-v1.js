// Usage: node scripts/build-reviews-approvals-mirror-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  createEmptyBody,
  normalizeRouteTarget,
} = require('./reviews-approvals-workflow-v1');

const sourcePath = path.join(__dirname, '..', 'mirror', 'reviews-approvals-source.v1.json');
const exportPath = path.join(__dirname, '..', 'exports', 'reviews-approvals-mirror.v1.json');
const allowedDecisions = new Set(['Approve', 'Deny', 'Modify']);
const bodySections = Object.keys(createEmptyBody());

function normalizeString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeBody(rawBody) {
  const body = typeof rawBody === 'object' && rawBody !== null ? rawBody : {};
  return bodySections.reduce((acc, key) => {
    acc[key] = normalizeString(body[key]);
    return acc;
  }, {});
}

function normalizeDecision(value) {
  if (typeof value === 'string' && allowedDecisions.has(value)) {
    return value;
  }
  return null;
}

let source;
try {
  source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
} catch (err) {
  console.error(`Unable to load source file: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(source.items)) {
  console.error('Source file does not expose an items array.');
  process.exit(1);
}

const items = source.items.map((rawItem) => {
  const decision = normalizeDecision(rawItem.decision);
  const executionAllowed = decision === 'Approve';

  return {
    task_id: normalizeString(rawItem.task_id),
    title: normalizeString(rawItem.title),
    status: normalizeString(rawItem.status),
    decision,
    risk: normalizeString(rawItem.risk),
    route_target: normalizeRouteTarget(rawItem.route_target),
    needs_approval: Boolean(rawItem.needs_approval),
    execution_allowed: executionAllowed,
    trigger_reason: normalizeString(rawItem.trigger_reason),
    operator_notes: normalizeString(rawItem.operator_notes),
    revised_instructions: normalizeString(rawItem.revised_instructions),
    sync_status: normalizeString(rawItem.sync_status),
    notion_page_id: normalizeString(rawItem.notion_page_id),
    notion_url: normalizeString(rawItem.notion_url),
    created_at: normalizeString(rawItem.created_at),
    updated_at: normalizeString(rawItem.updated_at),
    workflow_stage: normalizeString(rawItem.workflow_stage),
    attempt_count:
      Number.isFinite(Number(rawItem.attempt_count)) && Number(rawItem.attempt_count) >= 0
        ? Number(rawItem.attempt_count)
        : 1,
    stage_retry_count:
      Number.isFinite(Number(rawItem.stage_retry_count)) && Number(rawItem.stage_retry_count) >= 0
        ? Number(rawItem.stage_retry_count)
        : 0,
    last_failure_stage: normalizeString(rawItem.last_failure_stage),
    last_failure_actor: normalizeString(rawItem.last_failure_actor),
    last_failure_code: normalizeString(rawItem.last_failure_code),
    last_failure_summary: normalizeString(rawItem.last_failure_summary),
    escalation_reason: normalizeString(rawItem.escalation_reason),
    current_prompt_template: normalizeString(rawItem.current_prompt_template),
    approval_gate:
      rawItem.approval_gate === 'prompt' || rawItem.approval_gate === 'action_plan'
        ? rawItem.approval_gate
        : null,
    artifacts:
      rawItem.artifacts && typeof rawItem.artifacts === 'object' ? rawItem.artifacts : {},
    body: normalizeBody(rawItem.body),
  };
});

const exportPayload = {
  export_version: 'v1',
  source: 'local_reviews_approvals_source',
  exported_at: new Date().toISOString(),
  items,
};

try {
  fs.writeFileSync(exportPath, JSON.stringify(exportPayload, null, 2));
} catch (err) {
  console.error(`Unable to write export: ${err.message}`);
  process.exit(1);
}

console.log(`Built ${items.length} reviews approval items to mirror file.`);

const validatorScript = path.join(__dirname, 'validate-reviews-approvals-mirror-v1.js');
const validator = spawnSync('node', [validatorScript], {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
});

if (validator.status !== 0) {
  console.error('Validation failed after building the mirror.');
  process.exit(validator.status || 1);
}

console.log('Validation passed.');
