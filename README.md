# oracle

Command-line helper that turns GPT-5 Pro into a one-shot oracle while optionally switching to GPT-5.1 with high reasoning effort. The tool sends a single request through the OpenAI Responses API, optionally attaches local files to your prompt, and can enable the platform web_search tool so the model can fetch fresh information before replying.

## Prerequisites

- [Bun](https://bun.sh) 1.3+
- An OpenAI API key with access to GPT-5 Pro or GPT-5.1 (`OPENAI_API_KEY`)

Copy `.env.example` to `.env` (or export the variable another way) and drop your key in:

```bash
cp .env.example .env
```

## Install & run

```bash
bun install
bun ./bin/oracle.js --prompt "Summarize the risk register" --file docs/risk-register.md
```

Use `bun run start` if you prefer invoking the script through the package.json shortcut.

## Features

- **Streaming responses** from GPT-5 Pro or GPT-5.1 (high reasoning) via the Responses API.
- **Built-in web search tool** enabled by default so answers can cite fresh info (`--no-search` to disable).
- **File attachments** with Markdown wrapping plus `--files-report` to see token impact per file.
- **Preflight checks**: GPT-tokenizer ensures prompts stay within the configured input budget and shows per-file breakdown when you exceed it.
- **Preview mode** (`--preview`) prints the token counts without calling the API. Add `--preview-json` only when you really need the raw payload dump.
- **Markdown render** (`--render-markdown`) emits the fully assembled prompt + file bundle using `[SYSTEM]`, `[USER]`, and `[FILE: path]` markers (no API call) so you can paste it straight into reviews or prompt guides.
- **Detached sessions**: every real run happens in the background, survives terminal closures, and logs to `~/.oracle/sessions/<sessionId>` alongside usage stats and costs.
- **Cost & usage summary** after every run (input/output/reasoning tokens, elapsed time, USD estimate) both on-screen and saved with the session.

## CLI flags

| Flag | Description |
| --- | --- |
| `-p, --prompt <text>` | **Required for new runs/preview.** User message that kicks off the request. |
| `-f, --file <path>` | Attach one or more files or directories (repeat the flag or pass a space separated list). Directories are scanned recursively and each file is embedded under a Markdown heading. |
| `-m, --model <name>` | Choose `gpt-5-pro` (default) or `gpt-5.1`. The latter automatically sets `reasoning.effort` to `high`. |
| `--search` | Adds the platform-provided `web_search_preview` tool so the model can cite fresh sources (default enabled). Use `--no-search` to disable. |
| `--max-input <tokens>` | Override the 196k token preflight guard if you know the model’s current limit is higher. |
| `--max-output <tokens>` | Tell the Responses API to stop generating after this many tokens. |
| `--system <text>` | Replace the default “Oracle” system prompt. |
| `--files-report` | Print a sorted table of attached files with their token counts and percentage of the input budget (auto-enabled when files exceed the budget). |
| `--preview` | Print the token budget summary and exit before hitting the API. |
| `--preview-json` | When combined with `--preview`, also dump the full JSON payload (otherwise only the summary/tokens print). |
| `--render-markdown` | Emit the assembled markdown for system prompt, user prompt, and attached files (no API call). |
| `--session <id>` | Attach to a stored session, replay the transcript, and follow the live stream if it is still running. |
| `--status` | List recent sessions (last 24 hours). Combine with `--status-hours <n>`, `--status-all`, and `--status-limit <n>` to tweak the listing. |
| `--silent` | Skip printing the model answer in foreground runs; still prints stats/tokens/costs. |

Every run ends with a stats block showing elapsed time, actual/estimated tokens, reasoning tokens, and dollar cost (computed from the official per-token rates for each model).

## How it works

1. Gathers the base prompt plus any referenced files. Files are resolved relative to the current working directory and embedded verbatim under markdown headings so GPT-5 gets clear provenance.
2. Uses `gpt-tokenizer`’s GPT-5/GPT-5 Pro encoders to count tokens for the synthetic system/user chat. If the estimate exceeds the configured budget (default 196,000 tokens for GPT-5 Thinking/Pro in the API), the CLI fails fast before hitting the network.
3. Sends a single `responses.create` call with your prompt, the optional `web_search_preview` tool, and (for GPT-5.1) `reasoning.effort = high`.
4. Streams the textual answer to stdout as soon as the API emits deltas (unless `--silent`), then prints run metadata including elapsed wall-clock time, API-reported usage numbers, and the computed USD cost. Cost is derived from OpenAI’s stated $1.25 / $10 per 1M token rate for GPT-5 and $15 / $120 per 1M tokens for GPT-5 Pro.

## Notes

- Responses stream by default; add `--silent` when driving this from scripts and you only need the stats block.
- Use `--preview` to inspect the final instructions + input text (including attached files) and verify token counts without spending API credits.
- Use `--files-report` (or attach files that exceed the input token budget) to see a descending summary of per-file token usage so you know what to trim.
- Directory paths expand recursively; consider pairing with `--files-report` to understand token impact before sending extremely large trees.
- Attachments are treated as plain UTF-8; binary files will throw. Keep extremely large files out of the prompt to avoid blowing the token budget.
- Each invocation is stored as a session under `~/.oracle/sessions`; script multi-turn flows by feeding prior session outputs back through `--file`.
- `bun run lint` invokes a lightweight Bun build to ensure the shipped JS stays syntax-valid.

## Sessions & Background Execution

Oracle writes every non-preview run to `~/.oracle/sessions/<timestamp>-<slug>` and spawns a detached Bun process so the request keeps streaming even if the originating shell exits.

Typical workflow:

1. Kick off a run: `bun run start -- -m gpt-5.1 -p "Fix the bug" --file src/app.ts`. The CLI immediately returns with the Session ID and the background worker carries on.
2. Tail it later: `oracle --session <sessionId>` replays the transcript from disk and follows new output until the run finishes.
3. Check recent work: `oracle --status` lists the last 24 hours of sessions (cap 1,000 entries). Use `--status-hours <n>`, `--status-all`, or `--status-limit <n>` to adjust the window. If you accumulate more than 1,000, delete old folders inside `~/.oracle/sessions`.
4. Need a different storage path? Set `ORACLE_HOME_DIR=/custom/cache` before running the CLI.

## Testing

```bash
bun test
```

The Bun test suite covers prompt building with attachments, preview mode, token budget enforcement, silent vs. streaming runs, and the stats/cost output without touching the OpenAI API.
