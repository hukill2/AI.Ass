// Usage: node scripts/assistant-decisions-quality-report-v1.js
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '..', 'runtime', 'assistant-decisions.v1.json');
const ALLOWED_PREFIXES = ['docs/', 'mirror/', 'exports/', 'runtime/', 'scripts/'];
const suppressedWarnings = [];

function isAnalysisOnly(text) {
  if (!text) return false;
  const low = text.toLowerCase();
  return /analysis|gather context|analysis-only|review|research|investigate/.test(low);
}

function exitError(message) {
  console.error(message);
  process.exit(1);
}

function loadJson() {
  if (!fs.existsSync(FILE_PATH)) {
    exitError(`Missing assistant decisions file: ${FILE_PATH}`);
  }
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch (err) {
    exitError(`Failed to parse assistant decisions file: ${err.message}`);
  }
}

function checkDecision(decision) {
  const warnings = [];
  const suppressed = [];
  if (!decision.reasoning || !decision.reasoning.trim()) {
    warnings.push('empty reasoning');
  }
  if (!Array.isArray(decision.risks_or_guardrails) || decision.risks_or_guardrails.length === 0) {
    warnings.push('empty risks_or_guardrails');
  }
  const filesArray = Array.isArray(decision.files_to_create_or_update)
    ? decision.files_to_create_or_update
    : [];
  const analysisOnly = isAnalysisOnly(decision.recommended_next_step);
  if (filesArray.length === 0) {
    if (analysisOnly) {
      suppressed.push('empty files_to_create_or_update');
    } else {
      warnings.push('empty files_to_create_or_update');
    }
  } else {
    const unusual = filesArray.filter((filename) => {
      return !ALLOWED_PREFIXES.some((prefix) => filename.startsWith(prefix));
    });
    if (unusual.length) {
      warnings.push('off-structure file suggestions');
    }
  }
  return { warnings, suppressed };
}

function report() {
  const data = loadJson();
  const decisions = Array.isArray(data.decisions) ? data.decisions : [];
  const flagged = [];

  decisions.forEach((decision) => {
    const { warnings, suppressed } = checkDecision(decision);
    if (warnings.length) {
      flagged.push({
        decision_id: decision.decision_id || '<missing>',
        task_id: decision.task_id || '<missing>',
        warnings,
      });
    }
    if (suppressed.length) {
      suppressedWarnings.push({
        decision_id: decision.decision_id || '<missing>',
        task_id: decision.task_id || '<missing>',
        suppressed,
      });
    }
  });

  console.log('--- Assistant Decisions Quality Report ---');
  console.log(`Total decisions: ${decisions.length}`);
  console.log(`Decisions with warnings: ${flagged.length}`);
  flagged.forEach((entry) => {
    console.log(`  - ${entry.decision_id} (${entry.task_id}): ${entry.warnings.join(', ')}`);
  });
  if (suppressedWarnings.length) {
    console.log('Notes:');
    suppressedWarnings.forEach((entry) => {
      console.log(
        `  - ${entry.decision_id} (${entry.task_id}): ${entry.suppressed.join(', ')} accepted because recommendation is analysis-only.`
      );
    });
  }
  console.log('Quality warnings do not block storage but highlight where human review may be needed.');
}

report();
