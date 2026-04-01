// Usage: node scripts/run-local-assistant-qwen-v2.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONTEXT_PATH = path.join(ROOT, 'runtime', 'task-context.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime', 'local-assistant-response.v2.json');
const DECISIONS_PATH = path.join(ROOT, 'runtime', 'assistant-decisions.v1.json');

if (!fs.existsSync(CONTEXT_PATH)) {
  console.error('Missing task context file:', CONTEXT_PATH);
  process.exit(1);
}

const context = fs.readFileSync(CONTEXT_PATH, 'utf8');

const prompt = `
You are the local AI.Ass assistant.
Use only the supplied task context and provide no extra commentary.
Do not invent missing facts, do not return Markdown, and respond with valid JSON only.
Limit arrays to a few practical items.
If you recommend implementation work, name existing or plausible project file paths under docs/, mirror/, exports/, runtime/, or scripts/.
If you recommend analysis-only work, state it explicitly (e.g., "analysis-only" or "gather context").
Task Context:
${context}
Required JSON Schema:
{
  "task_id": "",
  "recommended_next_step": "",
  "files_to_create_or_update": [],
  "reasoning": "",
  "risks_or_guardrails": [],
  "notes": ""
}
`;

const cmd = spawnSync('ollama', ['run', 'qwen2.5-coder:7b'], {
  cwd: ROOT,
  encoding: 'utf8',
  input: prompt,
  timeout: 120 * 1000,
});

if (cmd.error) {
  if (cmd.error.code === 'ENOENT') {
    console.error('Ollama not found. Install Ollama or ensure it is on PATH.');
    process.exit(1);
  }
  if (cmd.error.code === 'ETIMEDOUT') {
    console.error(
      'Ollama call timed out (the local model may still be loading). Please rerun once the model finishes loading.'
    );
    process.exit(1);
  }
  console.error('Ollama call failed:', cmd.error.message);
  process.exit(1);
}

if (cmd.status !== 0) {
  console.error('Ollama process exited with status', cmd.status);
  console.error(cmd.stderr || 'No stderr output.');
  process.exit(1);
}

const rawOutput = cmd.stdout;
fs.writeFileSync(OUTPUT_PATH, rawOutput);

let parsed;
try {
  parsed = JSON.parse(cleanJson(rawOutput));
} catch (err) {
  console.error('Model returned invalid JSON:', err.message);
  process.exit(1);
}

try {
  enforcePromptTightening(parsed);
} catch (err) {
  console.error('Structured output failed tightening rules:', err.message);
  process.exit(1);
}

const decisionsRaw = fs.readFileSync(DECISIONS_PATH, 'utf8');
let decisionsData;
try {
  decisionsData = JSON.parse(decisionsRaw);
} catch (err) {
  console.error('Failed to read assistant decisions store:', err.message);
  process.exit(1);
}
if (!decisionsData || decisionsData.version !== 'v1' || !Array.isArray(decisionsData.decisions)) {
  console.error('Assistant decisions store is invalid.');
  process.exit(1);
}

const newDecision = {
  decision_id: `dec-${Date.now()}`,
  task_id: parsed.task_id || '',
  model: 'qwen2.5-coder:7b',
  recommended_next_step: parsed.recommended_next_step || '',
  files_to_create_or_update: Array.isArray(parsed.files_to_create_or_update)
    ? parsed.files_to_create_or_update
    : [],
  reasoning: parsed.reasoning || '',
  risks_or_guardrails: Array.isArray(parsed.risks_or_guardrails) ? parsed.risks_or_guardrails : [],
  notes: parsed.notes || '',
  created_at: new Date().toISOString(),
};
decisionsData.decisions.push(newDecision);
fs.writeFileSync(DECISIONS_PATH, `${JSON.stringify(decisionsData, null, 2)}\n`);

console.log('Model used: qwen2.5-coder:7b');
console.log('Structured response written to:', OUTPUT_PATH);
console.log('Parsed structured response:', parsed);

function cleanJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith('```')) {
    const end = trimmed.indexOf('```', 3);
    if (end !== -1) {
      return trimmed.slice(trimmed.indexOf('\n') + 1, end).trim();
    }
  }
  return trimmed;
}

function isAllowedFile(filename) {
  const prefixes = ['docs/', 'mirror/', 'exports/', 'runtime/', 'scripts/'];
  return typeof filename === 'string' && prefixes.some((prefix) => filename.startsWith(prefix));
}

function isAnalysisOnly(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return /analysis|gather context|analysis-only|review|research|investigate/.test(lower);
}

function enforcePromptTightening(result) {
  const recommended = (result.recommended_next_step || '').trim();
  if (!recommended) {
    throw new Error('recommended_next_step must be populated.');
  }
  const files = Array.isArray(result.files_to_create_or_update) ? result.files_to_create_or_update : [];
  const requiresFiles = !isAnalysisOnly(recommended);
  if (requiresFiles && files.length === 0) {
    throw new Error('Implementation recommendations must list at least one project file.');
  }
  for (const file of files) {
    if (!isAllowedFile(file)) {
      throw new Error(`File suggestion "${file}" is outside the allowed structure.`);
    }
  }
  if (!result.reasoning || !result.reasoning.trim()) {
    throw new Error('reasoning must be populated.');
  }
  if (!Array.isArray(result.risks_or_guardrails) || result.risks_or_guardrails.length === 0) {
    throw new Error('risks_or_guardrails must contain practical warnings.');
  }
  if (!result.notes || result.notes.length > 200) {
    // allow short notes; no additional check needed
  }
}
