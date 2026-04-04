// Usage: node scripts/validate-reviews-approvals-mirror-v1.js
const fs = require('fs');
const path = require('path');
const { createEmptyBody } = require('./reviews-approvals-workflow-v1');

const mirrorPath = path.join(__dirname, '..', 'exports', 'reviews-approvals-mirror.v1.json');
const errors = [];

if (!fs.existsSync(mirrorPath)) {
  console.error(`Mirror file not found at ${mirrorPath}`);
  process.exit(1);
}

let raw;
try {
  raw = fs.readFileSync(mirrorPath, 'utf8');
} catch (err) {
  console.error(`Unable to read mirror file: ${err.message}`);
  process.exit(1);
}

let json;
try {
  json = JSON.parse(raw);
} catch (err) {
  console.error(`Mirror file is not valid JSON: ${err.message}`);
  process.exit(1);
}

const expectTopLevel = ['export_version', 'source', 'exported_at', 'items'];
expectTopLevel.forEach((key) => {
  if (!(key in json)) {
    errors.push(`Missing top-level key: ${key}`);
  }
});

if (!Array.isArray(json.items)) {
  errors.push('Top-level items must be an array.');
}

if (typeof json.export_version !== 'string') {
  errors.push('export_version must be a string.');
}
if (typeof json.source !== 'string') {
  errors.push('source must be a string.');
}
if (typeof json.exported_at !== 'string') {
  errors.push('exported_at must be a string.');
}

const allowedDecisions = new Set(['Approve', 'Deny', 'Modify']);
const itemFields = [
  'task_id',
  'title',
  'status',
  'decision',
  'risk',
  'route_target',
  'needs_approval',
  'execution_allowed',
  'trigger_reason',
  'operator_notes',
  'revised_instructions',
  'sync_status',
  'notion_page_id',
  'notion_url',
  'created_at',
  'updated_at',
  'workflow_stage',
  'attempt_count',
  'stage_retry_count',
  'last_failure_stage',
  'last_failure_actor',
  'last_failure_code',
  'last_failure_summary',
  'escalation_reason',
  'current_prompt_template',
  'approval_gate',
  'artifacts',
  'body',
];
const bodyFields = Object.keys(createEmptyBody());

if (Array.isArray(json.items)) {
  json.items.forEach((item, index) => {
    itemFields.forEach((field) => {
      if (!(field in item)) {
        errors.push(`Item ${index} missing field: ${field}`);
      }
    });

    if ('title' in item && typeof item.title !== 'string') {
      errors.push(`Item ${index} title must be a string.`);
    }
    if ('status' in item && typeof item.status !== 'string') {
      errors.push(`Item ${index} status must be a string.`);
    }
    if ('risk' in item && typeof item.risk !== 'string') {
      errors.push(`Item ${index} risk must be a string.`);
    }
    if ('route_target' in item && typeof item.route_target !== 'string') {
      errors.push(`Item ${index} route_target must be a string.`);
    }
    if ('sync_status' in item && typeof item.sync_status !== 'string') {
      errors.push(`Item ${index} sync_status must be a string.`);
    }
    if ('workflow_stage' in item && typeof item.workflow_stage !== 'string') {
      errors.push(`Item ${index} workflow_stage must be a string.`);
    }
    if ('attempt_count' in item && typeof item.attempt_count !== 'number') {
      errors.push(`Item ${index} attempt_count must be a number.`);
    }
    if ('stage_retry_count' in item && typeof item.stage_retry_count !== 'number') {
      errors.push(`Item ${index} stage_retry_count must be a number.`);
    }
    ['last_failure_stage', 'last_failure_actor', 'last_failure_code', 'last_failure_summary', 'escalation_reason', 'current_prompt_template'].forEach((field) => {
      if (field in item && typeof item[field] !== 'string') {
        errors.push(`Item ${index} ${field} must be a string.`);
      }
    });
    if ('approval_gate' in item && item.approval_gate !== null && !['prompt', 'action_plan'].includes(item.approval_gate)) {
      errors.push(`Item ${index} approval_gate must be null, prompt, or action_plan.`);
    }
    if ('artifacts' in item && (typeof item.artifacts !== 'object' || item.artifacts === null || Array.isArray(item.artifacts))) {
      errors.push(`Item ${index} artifacts must be an object.`);
    }
    ['created_at', 'updated_at'].forEach((ts) => {
      if (ts in item && typeof item[ts] !== 'string') {
        errors.push(`Item ${index} ${ts} must be a string.`);
      }
    });

    if ('needs_approval' in item && typeof item.needs_approval !== 'boolean') {
      errors.push(`Item ${index} needs_approval must be boolean.`);
    }
    if ('execution_allowed' in item && typeof item.execution_allowed !== 'boolean') {
      errors.push(`Item ${index} execution_allowed must be boolean.`);
    }

    if ('decision' in item) {
      if (item.decision !== null && !allowedDecisions.has(item.decision)) {
        errors.push(`Item ${index} decision must be null or one of Approve, Deny, Modify.`);
      }
    }

    if ('body' in item) {
      if (typeof item.body !== 'object' || item.body === null) {
        errors.push(`Item ${index} body must be an object.`);
      } else {
        bodyFields.forEach((section) => {
          if (!(section in item.body)) {
            errors.push(`Item ${index} body missing section: ${section}`);
          }
        });
      }
    }
  });
}

if (errors.length > 0) {
  console.error('Validation failed:');
  errors.forEach((msg) => console.error(`- ${msg}`));
  process.exit(1);
}

console.log('reviews-approvals-mirror.v1.json is valid.');
