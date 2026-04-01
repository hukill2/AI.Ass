// Usage: node scripts/build-task-context-v1.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TASK_INPUT_PATH = path.join(ROOT, 'runtime', 'task-input.v1.json');

function loadTaskInput() {
  if (!fs.existsSync(TASK_INPUT_PATH)) {
    throw new Error(`Missing task input file: ${TASK_INPUT_PATH}`);
  }
  return JSON.parse(fs.readFileSync(TASK_INPUT_PATH, 'utf8'));
}
const TASK_CONTEXT_PATH = path.join(ROOT, 'runtime', 'task-context.v1.json');

const FILES = [
  { label: 'routing', path: path.join(ROOT, 'mirror', 'routing-decisions.v1.json') },
  { label: 'learning', path: path.join(ROOT, 'mirror', 'learning-records.v1.json') },
  { label: 'reviews', path: path.join(ROOT, 'exports', 'reviews-approvals-mirror.v1.json') },
  { label: 'architecture', path: path.join(ROOT, 'mirror', 'architecture-pages.v1.json') },
];

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function scoreKeywords(text, keywords) {
  if (!text) return 0;
  const tokens = tokenize(text);
  return tokens.reduce((acc, token) => acc + (keywords.has(token) ? 1 : 0), 0);
}

function pickTop(items, limit = 2) {
  return items
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function buildKeywordSet(summary) {
  return new Set(tokenize(summary));
}

function selectRouting(data, keywords) {
  if (!Array.isArray(data.decisions)) return [];
  const scored = data.decisions.map((entry) => ({
    item: {
      task_id: entry.task_id || '',
      classification: entry.classification || '',
      reason: entry.reasoning || '',
    },
    score:
      scoreKeywords(entry.classification, keywords) +
      scoreKeywords(entry.reasoning, keywords) +
      scoreKeywords(entry.notes, keywords),
  }));
  return pickTop(scored);
}

function selectLearning(data, keywords) {
  if (!Array.isArray(data.records)) return [];
  const scored = data.records.map((entry) => ({
    item: {
      record_id: entry.record_id || '',
      task_id: entry.task_id || '',
      summary:
        (entry.worked || '') + ' ' + (entry.lesson_learned || '') + ' ' + (entry.final_outcome || ''),
    },
    score: scoreKeywords(entry.lesson_learned, keywords) + scoreKeywords(entry.worked, keywords),
  }));
  return pickTop(scored);
}

function selectReviews(data, keywords) {
  if (!Array.isArray(data.items)) return [];
  const scored = data.items.map((entry) => ({
    item: {
      task_id: entry.task_id || '',
      status: entry.status || '',
      summary: entry.body?.summary || '',
    },
    score:
      scoreKeywords(entry.body?.summary, keywords) +
      scoreKeywords(entry.body?.proposed_action, keywords),
  }));
  return pickTop(scored);
}

function selectArchitecture(data, keywords) {
  if (!Array.isArray(data.pages)) return [];
  const scored = data.pages.map((entry) => ({
    item: {
      page_id: entry.page_id || '',
      title: entry.title || '',
      content: entry.content || '',
    },
    score: scoreKeywords(entry.title, keywords) + scoreKeywords(entry.content, keywords),
  }));
  return pickTop(scored);
}

function main() {
  console.log('Building task context...');
  const input = loadTaskInput();
  const keywords = buildKeywordSet(input.task_summary);
  const reads = {};
  const routing = selectRouting(loadJson(FILES[0].path), keywords);
  reads.routing = routing.length;
  const learning = selectLearning(loadJson(FILES[1].path), keywords);
  reads.learning = learning.length;
  const reviews = selectReviews(loadJson(FILES[2].path), keywords);
  reads.reviews = reviews.length;
  const architecture = selectArchitecture(loadJson(FILES[3].path), keywords);
  reads.architecture = architecture.length;

  const payload = {
    task_id: input.task_id,
    task_summary: input.task_summary,
    relevant_routing_examples: routing,
    relevant_learning_records: learning,
    relevant_review_state: reviews,
    relevant_architecture_context: architecture,
    notes:
      'Deterministic keyword matches only. Expand rules once the runner is available.',
  };

  fs.writeFileSync(TASK_CONTEXT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  console.log('Task context written to runtime/task-context.v1.json');
  console.log('Reads per lane:', reads);
}

main();
