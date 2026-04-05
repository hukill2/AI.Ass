#!/usr/bin/env node

const dotenvx = require("@dotenvx/dotenvx");
const { syncUsage } = require("./sync-usage-to-notion");

dotenvx.config({ quiet: true });

const POLL_MS = Number(process.env.API_USAGE_SYNC_MS || 300000);

async function main() {
  log(`Watching API usage dashboard every ${POLL_MS}ms.`);

  while (true) {
    try {
      const result = await syncUsage();
      if (result && result.updated) {
        log(`Dashboard synced (${result.status}).`);
      }
    } catch (error) {
      log(`Sync failed: ${error.message}`, "ERROR");
    }
    await sleep(POLL_MS);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function log(message, level = "INFO") {
  console.log(`[api-usage] [${level}] ${message}`);
}

main().catch((error) => {
  log(error.message, "ERROR");
  process.exit(1);
});
