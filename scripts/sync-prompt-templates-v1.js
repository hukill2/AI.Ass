#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

const docxPath = path.join(__dirname, '..', 'AI Prompt Templates.docx');
const mirrorPath = path.join(__dirname, '..', 'docs', 'prompt-templates.md');

function getHeader(lastRefreshedDate) {
  return `# Prompt templates (markdown mirror)

> **Last refreshed:** ${lastRefreshedDate}

This file mirrors the prompt templates stored in Notion (and currently staged in C:/AI.Ass/AI Prompt Templates.docx for human reference). Run \`node scripts/sync-prompt-templates-v1.js\` whenever the staged document changes; the script converts that source into the exact \`### <name>\` / code-block schema the guard and retrieval helpers expect, then prints the full UTC timestamp it recorded. Until synchronization completes, treat the .docx file as the staging area and point readers/scripts at this markdown mirror only after it is refreshed.

## Templates

`;
}

async function main() {
  if (!fs.existsSync(docxPath)) {
    console.error('Staged prompt templates document not found at ' + docxPath + '.');
    process.exit(1);
  }

  const result = await mammoth.convertToMarkdown({ path: docxPath });
  const raw = (result.value || '').trim();
  if (!raw) {
    console.error('Converted markdown is empty; aborting update.');
    process.exit(1);
  }

  const lines = raw.split(/\r?\n/);
  const templates = [];
  let current = null;

  function cleanLine(line) {
    const normalizedPunctuation = line.replace(/\\\./g, '.');
    const normalizedPlaceholders = normalizedPunctuation.replace(/<([^>]+)>/g, (_, inner) => {
      const collapsed = inner.trim().replace(/\s+/g, '_');
      return `<${collapsed}>`;
    });
    return normalizedPlaceholders.replace(/\s+$/, '');
  }

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^__\d+\\?\) (.+)__$/);
    if (match) {
      if (current) {
        templates.push(current);
      }
      current = { name: match[1].trim(), body: '' };
      continue;
    }
    if (!current) {
      continue;
    }
    if (trimmed === '') {
      current.body += '\n';
    } else {
      current.body += cleanLine(trimmed) + '\n';
    }
  }
  if (current) {
    templates.push(current);
  }

  const templateSections = templates
    .map((template) => {
      const body = template.body.trim();
      return `### ${template.name}
> Template:
\`\`\`
${body}
\`\`\`
`;
    })
    .join('\n');

  const timestamp = new Date().toISOString();
  const headerDate = timestamp.split('T')[0];
  const content = getHeader(headerDate) + templateSections + '\n';
  fs.writeFileSync(mirrorPath, content, 'utf8');
  console.log('Mirror refreshed at ' + timestamp + '.');
}

main().catch((err) => {
  console.error('Prompt-template sync failed:', err);
  process.exit(1);
});
