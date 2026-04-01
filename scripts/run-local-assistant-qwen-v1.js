// Usage: node scripts/run-local-assistant-qwen-v1.js
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CONTEXT_PATH = path.join(ROOT, 'runtime', 'task-context.v1.json');
const OUTPUT_PATH = path.join(ROOT, 'runtime', 'local-assistant-response.v1.txt');
const os = require('os');
const PROMPT_PATH = path.join(os.tmpdir(), 'ai-ass-task-context-prompt.txt');

if (!fs.existsSync(CONTEXT_PATH)) {
  console.error('Missing task context file:', CONTEXT_PATH);
  process.exit(1);
}

const context = fs.readFileSync(CONTEXT_PATH, 'utf8');

const prompt = `
You are the local AI.Ass assistant.
You must use the supplied task context when responding.
Do not invent missing facts; stay concise and provide a practical next step.
Task Context:
${context}
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

fs.writeFileSync(OUTPUT_PATH, cmd.stdout);
console.log('Model used: qwen2.5-coder:7b');
console.log('Context read from:', CONTEXT_PATH);
console.log('Response written to:', OUTPUT_PATH);
