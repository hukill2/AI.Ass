require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");
const { Client } = require("@notionhq/client");
const fs = require("fs");
const path = require("path");

/**
 * Executor Librarian v1
 * Uses Gemini 1.5 Pro to create technical execution plans.
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is not set in the .env file.");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const notion = new Client({
  auth: process.env.NOTION_API_KEY,
  notionVersion: "2026-03-11",
});

const ROOT_PAGE_ID = "3340f0280c2b81d1a073e6d3a4ec246d";
const PROJECT_MAP_PATH = path.join(__dirname, "..", "mirror", "project-map.json");

const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-pro-preview",
  "gemini-3-flash-preview",
];

async function generateExecutionPlan(taskId) {
  const taskPath = path.join(
    "C:\\ai.ass\\runtime\\queue",
    `task-${taskId}.json`,
  );
  const handoffPath = path.join("C:\\ai.ass\\docs", "OS-V1-HANDOFF.md");
  const outputPath = path.join(
    "C:\\ai.ass\\runtime\\queue",
    `task-${taskId}.plan.md`,
  );

  // Basic error handling for missing files
  if (!fs.existsSync(taskPath)) {
    console.error(`Error: Task file not found at ${taskPath}`);
    return;
  }
  if (!fs.existsSync(handoffPath)) {
    console.error(`Error: Handoff context not found at ${handoffPath}`);
    return;
  }

  try {
    const taskData = JSON.parse(fs.readFileSync(taskPath, "utf8"));
    const handoffContext = fs.readFileSync(handoffPath, "utf8");
    const projectContext = await resolveProjectContext(taskData);

    console.log(`Generating execution plan for task: ${taskId}...`);

    const prompt = `Acting as the OS Librarian, create a technical execution plan for Qwen-7B based on this task and handoff context. Follow the No-Soup naming policy.

${projectContext ? `PROJECT CONTEXT:\n${projectContext}\n` : ""}
Task Data:
${JSON.stringify(taskData, null, 2)}

Handoff Context:
${handoffContext}`;

    const response = await generateWithFallback(prompt);

    // Extract text from response
    // The @google/genai SDK response structure for generateContent
    let planText = "";
    if (
      response &&
      response.candidates &&
      response.candidates[0] &&
      response.candidates[0].content &&
      response.candidates[0].content.parts
    ) {
      planText = response.candidates[0].content.parts
        .map((p) => p.text)
        .join("");
    } else {
      // Fallback or handle cases where structure might be slightly different in newer versions
      planText = JSON.stringify(response, null, 2);
    }

    fs.writeFileSync(outputPath, planText);
    console.log(`Execution plan saved to: ${outputPath}`);
  } catch (error) {
    console.error(
      `Error generating execution plan for ${taskId}:`,
      error.message,
    );
  }
}

async function generateWithFallback(prompt) {
  let lastError;

  for (const model of GEMINI_MODELS) {
    try {
      console.log(`Requesting plan from model: ${model}`);
      return await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      const isModelLookupIssue =
        error && error.status === 404
          ? true
          : /404|not found|unsupported|models\//i.test(message);

      if (
        !isModelLookupIssue ||
        model === GEMINI_MODELS[GEMINI_MODELS.length - 1]
      ) {
        throw error;
      }

      console.warn(`Model ${model} unavailable. Retrying with fallback model.`);
    }
  }

  throw (
    lastError || new Error("No Gemini model could generate the execution plan.")
  );
}

async function resolveProjectContext(taskData) {
  const projectName =
    (taskData.metadata && taskData.metadata.project) ||
    taskData.project ||
    taskData.title ||
    "";
  const name = String(projectName).trim();
  if (!name) return "";

  const map = readProjectMap();
  let pageId = map[name];
  if (!pageId) {
    pageId = await findPageIdByName(ROOT_PAGE_ID, name);
    if (pageId) {
      map[name] = pageId;
      writeProjectMap(map);
    }
  }

  if (!pageId) return "";
  const content = await getPageContent(pageId);
  return content ? content : "";
}

function readProjectMap() {
  try {
    if (!fs.existsSync(PROJECT_MAP_PATH)) return {};
    const raw = fs.readFileSync(PROJECT_MAP_PATH, "utf8");
    return JSON.parse(raw || "{}");
  } catch (error) {
    return {};
  }
}

function writeProjectMap(map) {
  try {
    fs.mkdirSync(path.dirname(PROJECT_MAP_PATH), { recursive: true });
    fs.writeFileSync(PROJECT_MAP_PATH, JSON.stringify(map, null, 2), "utf8");
  } catch (error) {
    console.warn("Failed to update project map:", error.message);
  }
}

async function findPageIdByName(blockId, target, depth = 0) {
  if (depth > 5) return null;
  const children = await fetchBlocks(blockId);
  for (const block of children) {
    if (block.type === "child_page") {
      const title = String(block.child_page.title || "").trim().toLowerCase();
      if (title === target.toLowerCase()) {
        return block.id;
      }
      const nested = await findPageIdByName(block.id, target, depth + 1);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

async function fetchBlocks(blockId) {
  const all = [];
  let cursor = undefined;
  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    all.push(...response.results);
    cursor = response.has_more ? response.next_cursor : null;
  } while (cursor);
  return all;
}

async function getPageContent(pageId) {
  let textContent = "";
  try {
    const blocks = await fetchBlocks(pageId);
    for (const block of blocks) {
      if (block.type === "paragraph") {
        textContent +=
          block.paragraph.rich_text.map((t) => t.plain_text).join("") + "\n";
      } else if (block.type === "heading_2" || block.type === "heading_3") {
        const headingText = block[block.type].rich_text
          .map((t) => t.plain_text)
          .join("");
        textContent += `### ${headingText}\n`;
      }
    }
  } catch (e) {
    console.error(`Failed to fetch context for ${pageId}:`, e.message);
  }
  return textContent.trim();
}

// Allow CLI usage: node scripts/executor-librarian-v1.js test-001
if (require.main === module) {
  const taskIdArg = process.argv[2];
  if (!taskIdArg) {
    console.error("Usage: node scripts/executor-librarian-v1.js <taskId>");
    process.exit(1);
  }
  generateExecutionPlan(taskIdArg);
}

module.exports = { generateExecutionPlan };
