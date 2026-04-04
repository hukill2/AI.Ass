const { execSync } = require('child_process');
const path = require('path');

const currentFile = process.argv[1];
const args = process.argv.slice(2).join(' ');
const newScript = currentFile.replace('codex', 'executor');

if (currentFile === newScript) {
    console.error('[LIBRARIAN] Error: Shim recursion detected. Ensure the new script exists.');
    process.exit(1);
}

console.log(`[LIBRARIAN] Redirecting legacy call to: ${path.basename(newScript)}`);

try {
    execSync(`node "${newScript}" ${args}`, { stdio: 'inherit' });
} catch (e) {
    process.exit(e.status || 1);
}
