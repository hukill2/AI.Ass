#!/usr/bin/env node
/*
  micro-manifest-runner-v1.js
  Purpose: Safely apply tiny, policy-bounded file operations in a single approved batch.
  Ops supported (v1):
    - writeFile: { op, path, content, contentSha256? }
    - replaceInFile: { op, path, oldText, newText, oldTextSha256?, replaceAll? }
    - ensureTextPresent: { op, path, text, insertMode: "prepend"|"append", guardRegex? }

  Constraints are enforced by a policy file:
    C:\\AI.Ass\\runtime\\policy\\micro-manifest-policy.v1.json

  Invocation:
    node scripts/micro-manifest-runner-v1.js <manifestPath> [--dry-run] [--skip-pre] [--skip-post]

  Report is written to:
    C:\\AI.Ass\\runtime\\manifests\\reports\\<manifestBase>-result.json
*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

function log(...args) { console.log('[micro-manifest]', ...args); }
function err(...args) { console.error('[micro-manifest:ERROR]', ...args); }

function sha256(str) { return crypto.createHash('sha256').update(str, 'utf8').digest('hex'); }
function escapeRegex(str) { return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) + '-' +
    pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds())
  );
}

function normalizeWin(p) { return path.normalize(p); }
function toLowerWin(p) { return normalizeWin(p).toLowerCase(); }

function withinAllowedDirs(p, allowedDirs) {
  const lp = toLowerWin(p);
  return allowedDirs.some((dir) => lp.startsWith(toLowerWin(dir + path.sep)) || lp === toLowerWin(dir));
}

function containsBlockedSegment(p, blockedSegments) {
  const parts = normalizeWin(p).split(path.sep).map((x) => x.toLowerCase());
  return blockedSegments.some((seg) => parts.includes(seg.toLowerCase()));
}

function countLineDelta(oldStr, newStr) {
  const oldLines = (oldStr || '').split(/\r?\n/).length;
  const newLines = (newStr || '').split(/\r?\n/).length;
  const diff = newLines - oldLines; // naive: positive => additions, negative => deletions
  return { additions: diff > 0 ? diff : 0, deletions: diff < 0 ? -diff : 0 };
}

function runCmd({ cwd, command, args = [], label, failOnError = true, skipIfMissingDir = false }) {
  if (skipIfMissingDir && !fs.existsSync(cwd)) {
    log(`check ${label || command}: skipped (missing dir ${cwd})`);
    return { skipped: true, code: 0, stdout: '', stderr: '' };
  }
  const normalizedCommand = String(command || '').trim().toLowerCase();
  const spawnCommand = process.platform === 'win32' && normalizedCommand === 'npm' ? 'cmd.exe' : command;
  const spawnArgs =
    process.platform === 'win32' && normalizedCommand === 'npm'
      ? ['/d', '/s', '/c', 'npm.cmd', ...args]
      : args;
  const res = spawnSync(spawnCommand, spawnArgs, { cwd, encoding: 'utf8', shell: false });
  if (res.error) {
    const msg = `check ${label || command} error: ${res.error.message}`;
    if (failOnError) throw new Error(msg);
    log(msg);
  }
  if (res.status !== 0) {
    const msg = `check ${label || command} failed: code ${res.status}\n${res.stderr || res.stdout}`;
    if (failOnError) throw new Error(msg);
    log(msg);
  } else {
    log(`check ${label || command}: ok`);
  }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

function validatePolicy(policy) {
  const required = ['maxFiles', 'maxAdditionsPerFile', 'maxDeletionsPerFile', 'allowedDirs', 'blockedSegments', 'forbiddenPatterns'];
  for (const k of required) {
    if (!(k in policy)) throw new Error(`policy missing required key: ${k}`);
  }
}

function enforceContentGuards(content, policy) {
  const text = String(content || '');
  for (const pat of policy.forbiddenPatterns || []) {
    if (!pat) continue;
    const patternText = String(pat);
    const isWordPattern = /^[A-Za-z][A-Za-z\s-]*[A-Za-z]$/.test(patternText);
    const matches = isWordPattern
      ? new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(patternText)}([^A-Za-z0-9_]|$)`, 'i').test(text)
      : text.includes(patternText);
    if (matches) {
      throw new Error(`content contains forbidden pattern: ${pat}`);
    }
  }
}

function backupFile(targetPath) {
  const ts = nowStamp();
  const bakPath = `${targetPath}.bak.${ts}`;
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, bakPath);
    return bakPath;
  }
  return null;
}

function ensureParentDir(p) {
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true });
}

function applyWriteFile(step, policy, dryRun) {
  const target = normalizeWin(step.path);
  const exists = fs.existsSync(target);
  const prev = exists ? fs.readFileSync(target, 'utf8') : '';
  const next = step.content || '';

  if (step.contentSha256) {
    const actual = sha256(next);
    if (actual !== step.contentSha256) throw new Error(`writeFile contentSha256 mismatch for ${target}`);
  }

  enforceContentGuards(next, policy);
  const { additions, deletions } = countLineDelta(prev, next);
  if (additions > policy.maxAdditionsPerFile) throw new Error(`writeFile additions exceed cap for ${target}: ${additions} > ${policy.maxAdditionsPerFile}`);
  if (deletions > policy.maxDeletionsPerFile) throw new Error(`writeFile deletions exceed cap for ${target}: ${deletions} > ${policy.maxDeletionsPerFile}`);

  let backup = null;
  if (!dryRun) {
    backup = backupFile(target);
    ensureParentDir(target);
    fs.writeFileSync(target, next, 'utf8');
  }
  return { target, existed: exists, backup, additions, deletions, changed: prev !== next };
}

function applyReplaceInFile(step, policy, dryRun) {
  const target = normalizeWin(step.path);
  if (!fs.existsSync(target)) throw new Error(`replaceInFile target does not exist: ${target}`);
  const prev = fs.readFileSync(target, 'utf8');
  const oldText = step.oldText || '';
  const newText = step.newText || '';

  if (step.oldTextSha256) {
    const actual = sha256(oldText);
    if (actual !== step.oldTextSha256) throw new Error(`replaceInFile oldTextSha256 mismatch for ${target}`);
  }

  enforceContentGuards(newText, policy);

  let replaced = '';
  if (step.replaceAll) {
    const re = new RegExp(oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    replaced = prev.replace(re, newText);
  } else {
    replaced = prev.replace(oldText, newText);
  }

  if (replaced === prev) {
    return { target, backup: null, additions: 0, deletions: 0, changed: false, note: 'no-op (pattern not found or unchanged)' };
  }

  const { additions, deletions } = countLineDelta(prev, replaced);
  if (additions > policy.maxAdditionsPerFile) throw new Error(`replaceInFile additions exceed cap for ${target}: ${additions} > ${policy.maxAdditionsPerFile}`);
  if (deletions > policy.maxDeletionsPerFile) throw new Error(`replaceInFile deletions exceed cap for ${target}: ${deletions} > ${policy.maxDeletionsPerFile}`);

  let backup = null;
  if (!dryRun) {
    backup = backupFile(target);
    fs.writeFileSync(target, replaced, 'utf8');
  }
  return { target, backup, additions, deletions, changed: true };
}

function applyEnsureTextPresent(step, policy, dryRun) {
  const target = normalizeWin(step.path);
  const exists = fs.existsSync(target);
  const prev = exists ? fs.readFileSync(target, 'utf8') : '';
  const text = step.text || '';
  enforceContentGuards(text, policy);

  const guard = step.guardRegex ? new RegExp(step.guardRegex, 'm') : null;
  if (guard && guard.test(prev)) {
    return { target, backup: null, additions: 0, deletions: 0, changed: false, note: 'guardRegex present; skipping insert' };
  }
  if (prev.includes(text)) {
    return { target, backup: null, additions: 0, deletions: 0, changed: false, note: 'text already present; skipping insert' };
  }

  const mode = step.insertMode || 'append';
  let next;
  if (mode === 'prepend') {
    next = text + (prev ? (prev.startsWith('\n') ? '' : '\n') + prev : '');
  } else {
    next = (prev ? prev + (prev.endsWith('\n') ? '' : '\n') : '') + text;
  }

  const { additions, deletions } = countLineDelta(prev, next);
  if (additions > policy.maxAdditionsPerFile) throw new Error(`ensureTextPresent additions exceed cap for ${target}: ${additions} > ${policy.maxAdditionsPerFile}`);
  if (deletions > policy.maxDeletionsPerFile) throw new Error(`ensureTextPresent deletions exceed cap for ${target}: ${deletions} > ${policy.maxDeletionsPerFile}`);

  let backup = null;
  if (!dryRun) {
    backup = backupFile(target);
    ensureParentDir(target);
    fs.writeFileSync(target, next, 'utf8');
  }
  return { target, backup, additions, deletions, changed: prev !== next };
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length < 1) {
      console.error('Usage: node scripts/micro-manifest-runner-v1.js <manifestPath> [--dry-run] [--skip-pre] [--skip-post]');
      process.exit(1);
    }
    const manifestPath = normalizeWin(args[0]);
    const dryRun = args.includes('--dry-run');
    const skipPre = args.includes('--skip-pre');
    const skipPost = args.includes('--skip-post');

    if (!fs.existsSync(manifestPath)) throw new Error(`manifest not found: ${manifestPath}`);

    const policyPath = process.env.AI_ASS_POLICY_PATH || normalizeWin('C:/AI.Ass/runtime/policy/micro-manifest-policy.v1.json');
    if (!fs.existsSync(policyPath)) throw new Error(`policy file not found: ${policyPath}`);

    const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
    validatePolicy(policy);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!Array.isArray(manifest.steps)) throw new Error('manifest.steps must be an array');

    // Count unique target files to enforce maxFiles
    const uniqueTargets = new Set(
      manifest.steps.map((s) => normalizeWin(s.path))
    );
    if (uniqueTargets.size > policy.maxFiles) {
      throw new Error(`manifest targets ${uniqueTargets.size} files; policy allows max ${policy.maxFiles}`);
    }

    // Path policy checks up-front
    for (const step of manifest.steps) {
      const t = normalizeWin(step.path);
      if (!path.isAbsolute(t)) throw new Error(`target path must be absolute: ${t}`);
      if (!withinAllowedDirs(t, policy.allowedDirs)) throw new Error(`target path not within allowedDirs: ${t}`);
      if (containsBlockedSegment(t, policy.blockedSegments)) throw new Error(`target path contains blocked segment: ${t}`);
    }

    // Preflight checks
    const preChecks = (policy.checks && policy.checks.pre) || [];
    if (!skipPre) {
      for (const c of preChecks) runCmd(c);
    } else {
      log('skipping preflight checks');
    }

    const results = [];
    let anyError = null;

    for (const step of manifest.steps) {
      const op = step.op;
      try {
        let res;
        if (op === 'writeFile') {
          res = applyWriteFile(step, policy, dryRun);
        } else if (op === 'replaceInFile') {
          res = applyReplaceInFile(step, policy, dryRun);
        } else if (op === 'ensureTextPresent') {
          res = applyEnsureTextPresent(step, policy, dryRun);
        } else {
          throw new Error(`unsupported op: ${op}`);
        }
        results.push({ op, ...res, status: 'ok' });
        log(`${op} -> ${res.target} ${res.changed ? '(changed)' : '(no-op)'}`);
      } catch (e) {
        anyError = e;
        results.push({ op, path: step.path, status: 'error', error: String(e.message || e) });
        err(`${op} failed for ${step.path}: ${e.message || e}`);
        break; // abort on first failure
      }
    }

    // Postflight checks
    const postChecks = (policy.checks && policy.checks.post) || [];
    if (!skipPost && !anyError) {
      for (const c of postChecks) runCmd(c);
    } else if (skipPost) {
      log('skipping postflight checks');
    }

    const manifestBase = path.basename(manifestPath).replace(/\.json$/i, '');
    const reportsDir = normalizeWin('C:/AI.Ass/runtime/manifests/reports');
    fs.mkdirSync(reportsDir, { recursive: true });
    const reportPath = path.join(reportsDir, `${manifestBase}-result.json`);

    const summary = {
      ok: !anyError,
      manifestPath,
      policyPath,
      dryRun,
      results,
      error: anyError ? String(anyError.message || anyError) : null,
      timestamp: new Date().toISOString(),
      host: os.hostname(),
    };

    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), 'utf8');
    if (anyError) {
      err('Manifest application failed. See report:', reportPath);
      process.exit(1);
    } else {
      log('Manifest applied successfully. Report:', reportPath);
      process.exit(0);
    }
  } catch (e) {
    err(e.message || e);
    process.exit(1);
  }
}

main();
