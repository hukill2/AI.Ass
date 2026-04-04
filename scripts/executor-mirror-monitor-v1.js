const fs = require("fs");
const path = require("path");

// 1. CONFIGURATION - Matched to your actual file
const MIRROR_FILENAME = "reviews-approvals-source.v1.json";
const MIRROR_PATH = path.join(__dirname, "..", "mirror", MIRROR_FILENAME);
const QUEUE_DIR = path.join(__dirname, "..", "runtime", "queue");
const LOG_FILE = path.join(
  __dirname,
  "..",
  "runtime",
  "logs",
  "system-heartbeat.log",
);

console.log(`[LIBRARIAN] Monitoring Mirror at: ${MIRROR_PATH}`);

// SAFETY CHECK: Ensure the file exists
if (!fs.existsSync(MIRROR_PATH)) {
  console.error(`[LIBRARIAN] ERROR: Mirror file not found at ${MIRROR_PATH}`);
  process.exit(1);
}

// 2. THE WATCHER LOGIC
fs.watch(MIRROR_PATH, (eventType) => {
  if (eventType === "change") {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Mirror Update Detected...`);
    scanMirrorForApprovedTasks();
  }
});

function scanMirrorForApprovedTasks() {
  try {
    const fileContent = fs.readFileSync(MIRROR_PATH, "utf8");
    const data = JSON.parse(fileContent);

    // Accessing the 'items' array from your specific JSON structure
    const tasks = data.items || [];

    // Filter for 'Approved' (Note: Your uploaded file shows 'Pending Review',
    // so this will only trigger once you change a status to 'Approved' in Notion)
    const approved = tasks.filter((t) => t.status === "Approved");

    approved.forEach((task) => {
      const taskPath = path.join(QUEUE_DIR, `task-${task.task_id}.json`);
      if (!fs.existsSync(taskPath)) {
        fs.writeFileSync(taskPath, JSON.stringify(task, null, 2));

        const logMsg = `[LIBRARIAN] New task queued: ${task.task_id} (${task.title})\n`;
        fs.appendFileSync(LOG_FILE, logMsg);
        console.log(logMsg.trim());
      }
    });
  } catch (err) {
    console.error(`[LIBRARIAN] Error scanning mirror: ${err.message}`);
  }
}
