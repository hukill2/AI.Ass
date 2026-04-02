#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

const recognizedOptions = {
  '--subsystem': 'SUBSYSTEM_NAME',
  '--confirmed-change': 'CONFIRMED_CHANGE',
  '--contract-point': 'CONTRACT_POINT',
};

const sets = [];

function printUsage() {
  console.log('Usage: node scripts/build-closeout-prompt-v1.js [--subsystem="<name>"] [--confirmed-change="<text>"] [--contract-point="<text>"] [--set KEY=VALUE ...]');
  console.log('This builds a closeout prompt by running the prompt workflow runner with the closeout preset.');
  console.log('Any provided values are forwarded as replacements for the closeout template placeholders.');
  console.log('Examples:');
  console.log('  node scripts/build-closeout-prompt-v1.js --subsystem="Prompt mirror" --confirmed-change="Updated mirror" --contract-point="Mirror contract recorded" --set COMMIT_MESSAGE="Refresh mirror"');
  console.log('  node scripts/build-closeout-prompt-v1.js --confirmed-change="Refreshed templates" --set COMMIT_MESSAGE="Mirror refresh"');
}

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg.startsWith('--set=')) {
    sets.push(['--set', arg.substring(6)]);
  } else if (arg === '--set') {
    const next = args[i + 1];
    if (!next) {
      console.error('Missing value for --set');
      process.exit(1);
    }
    sets.push(['--set', next]);
    i += 1;
  } else if (arg.includes('=')) {
    const [option, value] = arg.split('=', 2);
    if (recognizedOptions[option]) {
      const key = recognizedOptions[option];
      sets.push(['--set', `${key}=${value}`]);
    } else {
      console.error(`Unknown option ${option}`);
      process.exit(2);
    }
  } else {
    console.error(`Unsupported argument ${arg}`);
    process.exit(2);
  }
}

const runnerArgs = ['--preset=closeout'];
sets.forEach((set) => runnerArgs.push(...set));

const runner = spawnSync(process.execPath, [path.resolve(__dirname, 'run-prompt-workflow-v1.js'), ...runnerArgs], { stdio: 'inherit' });
process.exit(runner.status);
