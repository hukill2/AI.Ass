#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { Client } = require("@notionhq/client");
const dotenvx = require("@dotenvx/dotenvx");

dotenvx.config({ quiet: true });

async function main() {
  const [parentId, title, markdownPath, outputPath] = process.argv.slice(2);
  if (!parentId || !title || !markdownPath) {
    console.error(
      "Usage: node scripts/create-notion-page-v1.js <parent-page-id> <title> <markdown-file> [output-url-file]"
    );
    process.exit(1);
  }

  if (!process.env.NOTION_API_KEY) {
    console.error("NOTION_API_KEY is not set in environment.");
    process.exit(1);
  }

  const notion = new Client({ auth: process.env.NOTION_API_KEY, notionVersion: "2026-03-11" });

  const content = fs.readFileSync(path.resolve(markdownPath), "utf8");
  const blocks = markdownToNotionBlocks(content);

  const page = await notion.pages.create({
    parent: { page_id: parentId },
    properties: {
      title: {
        title: [
          {
            type: "text",
            text: { content: title.slice(0, 1800) },
          },
        ],
      },
    },
    children: blocks,
  });

  const url = page.url || page.id;
  if (outputPath) {
    try {
      const out = path.resolve(outputPath);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, url + "\n", "utf8");
    } catch (e) {
      console.error("Warning: failed to write output file:", e.message);
    }
  }
  console.log(url);
}

function markdownToNotionBlocks(md) {
  const lines = md.split(/\r?\n/);
  const blocks = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join("\n");
    blocks.push(paragraphBlock(text));
    paragraph = [];
  };

  while (lines.length) {
    const raw = lines.shift();
    const line = raw.trimEnd();
    if (/^#\s+/.test(line)) {
      flushParagraph();
      blocks.push(headingBlock(line.replace(/^#\s+/, "").trim()));
      continue;
    }
    if (/^##\s+/.test(line)) {
      flushParagraph();
      blocks.push(subHeadingBlock(line.replace(/^##\s+/, "").trim()));
      continue;
    }
    if (/^-\s+/.test(line)) {
      flushParagraph();
      blocks.push(bulletedListItemBlock(line.replace(/^-\s+/, "").trim()));
      continue;
    }
    if (/^```/.test(line)) {
      // naive code fence handling: gather until next ```
      const codeLines = [];
      const lang = line.replace(/```+\s*/, "").trim() || "plain_text";
      while (lines.length && !/^```/.test(lines[0])) {
        codeLines.push(lines.shift());
      }
      // drop closing fence
      if (lines.length && /^```/.test(lines[0])) lines.shift();
      const code = codeLines.join("\n");
      blocks.push(codeBlock(code, lang));
      continue;
    }

    if (line === "") {
      flushParagraph();
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}

function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 1800) } }],
    },
  };
}

function headingBlock(text) {
  return {
    object: "block",
    type: "heading_1",
    heading_1: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 1800) } }],
    },
  };
}

function subHeadingBlock(text) {
  return {
    object: "block",
    type: "heading_2",
    heading_2: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 1800) } }],
    },
  };
}

function bulletedListItemBlock(text) {
  return {
    object: "block",
    type: "bulleted_list_item",
    bulleted_list_item: {
      rich_text: [{ type: "text", text: { content: text.slice(0, 1800) } }],
    },
  };
}

function codeBlock(text, language) {
  return {
    object: "block",
    type: "code",
    code: {
      language,
      rich_text: [{ type: "text", text: { content: text.slice(0, 1800) } }],
    },
  };
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Failed to create page:", err.message);
    process.exit(1);
  });
}
