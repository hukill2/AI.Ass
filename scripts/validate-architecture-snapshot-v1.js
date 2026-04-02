#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
function usage() {
  console.error('Usage: node scripts/validate-architecture-snapshot-v1.js <baseline.json> <comparison.json>');
  process.exit(1);
}
if (args.length !== 2) {
  usage();
}
const [baselinePath, comparisonPath] = args;
function readSnapshot(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('Missing snapshot file: ' + filePath);
    process.exit(1);
  }
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const snapshot = JSON.parse(text);
    if (!Array.isArray(snapshot.child_pages)) {
      console.error('Invalid snapshot schema in ' + filePath + ': child_pages array missing');
      process.exit(1);
    }
    return snapshot;
  } catch (error) {
    console.error('Failed to read/parse ' + filePath + ': ' + error.message);
    process.exit(1);
  }
}
const baseline = readSnapshot(baselinePath);
const comparison = readSnapshot(comparisonPath);
function mapByPageId(snapshot) {
  const map = new Map();
  snapshot.child_pages.forEach((entry) => {
    if (entry && entry.page_id) {
      map.set(entry.page_id, entry);
    }
  });
  return map;
}
const baseMap = mapByPageId(baseline);
const compMap = mapByPageId(comparison);
const added = [];
const removed = [];
const changed = [];
const fieldsToCompare = ['title', 'url', 'status', 'parent_id', 'level'];
for (const [pageId, entry] of compMap.entries()) {
  if (!baseMap.has(pageId)) {
    added.push({ page_id: pageId, entry });
  }
}
for (const [pageId, entry] of baseMap.entries()) {
  if (!compMap.has(pageId)) {
    removed.push({ page_id: pageId, entry });
  }
}
for (const pageId of baseMap.keys()) {
  if (!compMap.has(pageId)) continue;
  const baseEntry = baseMap.get(pageId);
  const compEntry = compMap.get(pageId);
  const diffs = {};
  fieldsToCompare.forEach((field) => {
    const a = baseEntry[field];
    const b = compEntry[field];
    if (a !== b) {
      diffs[field] = { from: a === undefined ? null : a, to: b === undefined ? null : b };
    }
  });
  if (Object.keys(diffs).length > 0) {
    changed.push({ page_id: pageId, differences: diffs, baseline: baseEntry, comparison: compEntry });
  }
}
const result = {
  status: added.length || removed.length || changed.length ? 'differences' : 'identical',
  baseline: baselinePath,
  comparison: comparisonPath,
  summary: { added: added.length, removed: removed.length, changed: changed.length },
  added,
  removed,
  changed,
};
console.log(JSON.stringify(result, null, 2));
if (result.status === 'identical') {
  process.exit(0);
}
process.exit(2);
