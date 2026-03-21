# Agent Mode & Parallel Batch Runs

Oracle can toggle ChatGPT's **Agent mode** and run **multiple agent jobs in parallel** using separate browser tabs.

## Agent Mode

Agent mode enables ChatGPT's agentic capabilities (browsing, code execution, file generation) for browser runs.

### CLI flag

```bash
oracle --engine browser --browser-agent-mode on -p "Research competitor pricing"
```

| Value | Behavior |
|---|---|
| `on` | Enable agent mode before sending the prompt |
| `off` | Disable agent mode |
| `current` | Leave the current toggle unchanged (default) |

### Config default

```json5
// ~/.oracle/config.json
{
  browser: {
    agentMode: "on"
  }
}
```

### How it works

Oracle clicks the composer **+** button, opens the tools menu (including any "More" submenu), finds the "Agent mode" / "Agenttilstand" option, and clicks it. The toggle is verified via `aria-checked` / `data-state` attributes.

## Parallel Batch Mode

Run many agent jobs concurrently using `--batch` and `--parallel`.

### Quick start

1. Create a manifest (`jobs.json`):

```json
[
  {
    "slug": "company-001",
    "prompt": "Research workflow surfaces for Company X. Produce markdown.",
    "files": ["context/company-001.md", "instructions.md"]
  },
  {
    "slug": "company-002",
    "prompt": "Research workflow surfaces for Company Y. Produce markdown.",
    "files": ["context/company-002.md", "instructions.md"]
  }
]
```

2. Run the batch:

```bash
oracle --engine browser --browser-manual-login \
  --browser-model-strategy current --browser-agent-mode on \
  --browser-timeout 30m \
  --batch jobs.json --parallel 3 \
  --write-output "results/{slug}.md"
```

### Manifest format

Each entry requires:
- `slug` (string) — unique job identifier, used in `{slug}` output path substitution
- `prompt` (string) — the prompt text

Optional:
- `files` (string[]) — file paths to inline into the prompt (relative to cwd)

### Flags

| Flag | Default | Description |
|---|---|---|
| `--batch <path>` | — | Path to the JSON manifest file |
| `--parallel <N>` | 4 | Number of concurrent browser tabs (max 8) |
| `--write-output <template>` | — | Output path with `{slug}` substitution |

### Behavior

- **Single Chrome, N tabs** — reuses your logged-in manual-login profile
- **Profile lock** serializes prompt submissions (2-3 seconds each); wait phases run fully in parallel (5-30 minutes each)
- **Agent mode** is toggled independently per tab
- **File-pointer expansion** — when ChatGPT Agent mode produces a file attachment instead of inline text, Oracle extracts the full rendered content from the DOM automatically
- **Resume** — on re-run, jobs whose output file already exists are skipped
- **Fault-tolerant** — if one tab disconnects (common during agent browsing), that job fails but the batch continues; re-run to retry failed jobs only
- **Progress** — printed per-job as they complete:
  ```
  ✓ [3/50] company-003 12m30s (18440 chars)
  ✗ [4/50] company-004 2m10s — CDP disconnected
  ```

### Recommended workflow

```bash
# 1. First-time login (once)
oracle --engine browser --browser-manual-login \
  --browser-keep-browser --browser-input-timeout 120000 \
  -p "HI"
# Sign into ChatGPT in the opened Chrome window.

# 2. Run batch
oracle --engine browser --browser-manual-login \
  --browser-model-strategy current --browser-agent-mode on \
  --browser-timeout 30m \
  --batch jobs.json --parallel 3 \
  --write-output "results/{slug}.md"

# 3. If some jobs failed, just re-run the same command:
# Completed jobs are skipped; only failed/missing ones retry.
```

### Important notes

- **Start with `--parallel 2-3`** and increase if ChatGPT doesn't throttle. Too many concurrent agent tabs may trigger rate limits.
- **Use `--browser-timeout 30m`** for agent runs — they browse the web and can take 10-30 minutes per job.
- **The batch process must stay alive.** Run it directly via terminal or with `nohup`, not inside ephemeral overlays that can be dismissed.
- **If Chrome profile issues occur** (stale port files, about:blank tabs), clean up:
  ```bash
  pkill -f '.oracle/browser-profile' || true
  rm -f ~/.oracle/browser-profile/DevToolsActivePort \
        ~/.oracle/browser-profile/Default/DevToolsActivePort \
        ~/.oracle/browser-profile/chrome.pid \
        ~/.oracle/browser-profile/oracle-automation.lock
  ```

### Using from a patched local build

If running from a local Oracle checkout:

```bash
# Build after code changes
cd /path/to/oracle && pnpm build

# Add alias (put in ~/.zshrc)
alias oracle-patch='node /path/to/oracle/dist/bin/oracle-cli.js'

# Run
oracle-patch --engine browser --browser-manual-login \
  --browser-agent-mode on --batch jobs.json --parallel 3 \
  --write-output "results/{slug}.md"
```
