#!/usr/bin/env node

const assert = require("assert");
const { STATUS, STAGE } = require("./reviews-approvals-workflow-v1");
const { shouldSyncPageBody } = require("./executor-notion-bridge-v1");

assert.strictEqual(
  shouldSyncPageBody({ status: STATUS.PENDING_REVIEW, workflow_stage: STAGE.PROMPT_APPROVAL }),
  true,
);
assert.strictEqual(
  shouldSyncPageBody({ status: STATUS.PROCESSING, workflow_stage: STAGE.LIBRARIAN_PROMPT_VALIDATION }),
  false,
);
assert.strictEqual(
  shouldSyncPageBody({ status: STATUS.RETRYING, workflow_stage: STAGE.QWEN_EXECUTION }),
  false,
);
assert.strictEqual(
  shouldSyncPageBody({ status: STATUS.ESCALATED, workflow_stage: STAGE.ESCALATED_TO_OPERATOR }),
  true,
);
assert.strictEqual(
  shouldSyncPageBody({ status: STATUS.COMPLETED, workflow_stage: STAGE.COMPLETED }),
  true,
);

console.log("notion body sync policy test passed");
