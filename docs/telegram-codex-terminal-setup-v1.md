# Telegram Codex Terminal Setup v1

## Purpose
- Run a dedicated Telegram chat bot that talks to the Codex/OpenAI model route.
- Support a semi-auto machine broker:
  - Phase 1 auto-runs read-only inspection and safe verification commands.
  - Phase 2 queues writes, approved commands, and git commits for `/approve`.
- Do not use it for intake.

## Required env vars
- `CODEX_TERMINAL_TELEGRAM_BOT_TOKEN`
- `CODEX_TERMINAL_TELEGRAM_CHAT_ID`
- `TELEGRAM_TERMINAL_ENABLED=true`
- `OPENAI_API_KEY`
- `CODEX_MODEL_ID` (defaults to `gpt-5`)
- `TELEGRAM_TERMINAL_ALLOWED_ROOTS`
- `TELEGRAM_TERMINAL_BLOCK_PATHS`

## How to get the chat id
1. Create the bot in Telegram with BotFather and copy the token.
2. Send a message to the bot from the target Telegram account.
3. In PowerShell run:

```powershell
$token = '<BOT_TOKEN>'
Invoke-RestMethod "https://api.telegram.org/bot$token/getUpdates" | ConvertTo-Json -Depth 10
```

4. Read:
- `result[0].message.chat.id`

Example extraction:

```powershell
$token = '<BOT_TOKEN>'
(Invoke-RestMethod "https://api.telegram.org/bot$token/getUpdates").result[-1].message.chat.id
```

If the result is empty:
- send `/start` or any message to the bot first
- rerun `getUpdates`
- verify `getWebhookInfo` shows an empty `url`

## Recommended startup flow after reboot
1. Start Ollama with the safe local settings:

```powershell
$env:OLLAMA_CONTEXT_LENGTH='2048'
$env:OLLAMA_NUM_PARALLEL='1'
$env:OLLAMA_FLASH_ATTENTION='false'
ollama serve
```

2. In a second terminal start the OS services:

```powershell
npm run start
```

3. If you only want the terminal bot without the rest of the OS:

```powershell
npm run telegram:terminal
```

## Current behavior
- The Telegram terminal bot is implemented by:
  - `scripts/telegram-codex-terminal-v1.js`
- The local execution broker is implemented by:
  - `scripts/telegram-codex-broker-v1.js`
- It is enabled by:
  - `TELEGRAM_TERMINAL_ENABLED=true`
- It supports:
  - `/help`
  - `/commands`
  - `/status`
  - `/pending`
  - `/approve`
  - `/reject`
  - `/reset`

## Guardrails
- Approved roots default to:
  - `C:\AI.Ass`
  - `E:\Mobiledets`
- Blocked path segments:
  - `.git`
  - `node_modules`
  - `.next`
  - `dist`
  - `build`
- Phase 1 auto mode:
  - list files
  - read files
  - tail files
  - run safe commands like `git status`, `git diff`, `npm run build`, `npm run lint`, `npm test`, `node --check`
- Phase 2 approval mode:
  - write full file contents
  - do targeted replace-in-file edits
  - run approved commands like `npm install`
  - run milestone `git commit`
- Git pushes and destructive commands are not enabled.
- The bot does not auto-file Notion tasks.
- Every approved action is logged to:
  - `runtime/logs/telegram-codex-terminal-actions.v1.jsonl`

## Example flow
1. Message the bot:
   - `inspect E:\Mobiledets\app\layout.tsx and tell me why build is failing`
2. The bot can auto-run file reads and `npm run build`.
3. If a fix is needed, it will queue a plan and tell you what is waiting.
4. Review with:

```text
/pending
```

5. Execute with:

```text
/approve
```

6. Clear without executing:

```text
/reject
```
