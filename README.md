# oracle 🧿 — Whispering your tokens to the silicon sage

<p align="center">
  <img src="./README-header.png" alt="Oracle CLI header banner" width="1100">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@steipete/oracle"><img src="https://img.shields.io/npm/v/@steipete/oracle?style=for-the-badge&logo=npm&logoColor=white" alt="npm version"></a>
  <a href="https://github.com/steipete/oracle/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/steipete/oracle/ci.yml?branch=main&style=for-the-badge&label=tests" alt="CI Status"></a>
  <a href="https://github.com/steipete/oracle"><img src="https://img.shields.io/badge/platforms-macOS%20%7C%20Linux%20%7C%20Windows-blue?style=for-the-badge" alt="Platforms"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=for-the-badge" alt="MIT License"></a>
</p>

Oracle bundles your prompt and files so another AI can answer with real context. It defaults to GPT-5.1 Pro; GPT-5.1 Codex is API-only; a browser engine exists but is **experimental**—prefer API or `--render --copy` and paste into ChatGPT yourself.

## Quick start

```bash
# Minimal API run (expects OPENAI_API_KEY in your env)
oracle -p "Summarize the risk register" --file docs/risk-register.md

# Multi-model API run
oracle -p "Cross-check the risk register" --models gpt-5.1-pro,gemini-3-pro --file docs/risk-register.md

# Render + copy bundle (manual paste into ChatGPT)
oracle --render --copy -p "Summarize the risk register" --file docs/risk-register.md

# Sessions (list and replay)
oracle status --hours 72
oracle session <id> --render

# TUI (interactive, experimental)
oracle
```

## Remote browser service (`oracle serve`)

Keep Chrome running on a signed-in host and drive it from another machine without shipping cookies:

1. On the host Mac, run `oracle serve` (or `oracle serve --port 9473 --token abc...`). It launches Chrome, prints `Listening at <host>:<port>` plus an access token, and exits if ChatGPT isn’t logged in so you can sign in and restart.
2. On the client, run `oracle --engine browser --remote-host <host:port> --remote-token <token> -p "..." --file <paths>`.
3. To skip flags, set defaults in `~/.oracle/config.json`:
   ```json5
   {
     remote: { host: "192.168.64.2:9473", token: "c4e5f9..." }
   }
  ```
  Env vars (`ORACLE_REMOTE_HOST`, `ORACLE_REMOTE_TOKEN`) still override the config.

Notes:
- Cookies never cross the wire; the host Chrome profile must stay signed in. If not, `oracle serve` opens chatgpt.com and exits.
- Remote mode requires `--engine browser` (or an auto-selected browser engine). Background/detached runs are disabled so logs can stream.

### Clipboard bundle (semi-manual)
- Build the markdown bundle, print it, and copy it to your clipboard in one go:
  ```bash
  oracle --render --copy -p "Summarize the risk register" --file docs/risk-register.md docs/risk-matrix.md
  ```

### Agent notes (from ../agent-scripts/AGENTS.MD)
```
- Oracle hygiene: run `npx -y @steipete/oracle --help` once per session before first use.
- Oracle gives your agents a simple, reliable way to bundle a prompt plus the right files and hand them to another AI (GPT 5 Pro + more). Use when stuck/bugs/reviewing code.
```

## Integration

- API mode expects `OPENAI_API_KEY` in your environment (set it once in your shell profile).
- Prefer API mode or `--render --copy` + manual paste; browser automation is experimental.
- MCP server: `pnpm mcp` (or `oracle-mcp`) after building; see [docs/mcp.md](docs/mcp.md).
- Remote browser service: `oracle serve` on a signed-in host; clients use `--remote-host/--remote-token`.

## Highlights

- Bundle once, reuse anywhere (API or experimental browser).
- Multi-model API runs with aggregated cost/usage.
- Render/copy bundles for manual paste into ChatGPT when automation is blocked.
- File safety: globs/excludes, size guards, `--files-report`.
- Sessions you can replay (`oracle status`, `oracle session <id> --render`).

## Flags you’ll actually use

| Flag | Purpose |
| --- | --- |
| `-p, --prompt <text>` | Required prompt. |
| `-f, --file <paths...>` | Attach files/dirs (globs + `!` excludes). |
| `-e, --engine <api\|browser>` | Choose API or browser (browser is experimental). |
| `-m, --model <name>` | `gpt-5.1-pro` (default), `gpt-5.1`, `gpt-5.1-codex` (API-only), plus documented aliases. |
| `--models <list>` | Comma-separated API models for multi-model runs. |
| `--base-url <url>` | Point API runs at LiteLLM/Azure/etc. |
| `--chatgpt-url <url>` | Target a ChatGPT workspace/folder (browser). |
| `--render`, `--copy` | Print and/or copy the assembled markdown bundle. |
| `--write-output <path>` | Save only the final answer (multi-model adds `.<model>`). |
| `--files-report` | Print per-file token usage. |
| `--dry-run [summary\|json\|full]` | Preview without sending. |
| `--remote-host`, `--remote-token` | Use a remote `oracle serve` host (browser). |
| `--remote-chrome <host:port>` | Attach to an existing remote Chrome session (browser). |

## Configuration

Put defaults in `~/.oracle/config.json` (JSON5). Example:
```json5
{
  model: "gpt-5.1-pro",
  engine: "api",
  filesReport: true,
  remote: { host: "192.168.64.2:9473", token: "c4e5f9..." }
}
```
See `docs/configuration.md` for precedence and full schema.

## More docs

- Browser mode & forks: [docs/browser-mode.md](docs/browser-mode.md), [docs/chromium-forks.md](docs/chromium-forks.md), [docs/linux.md](docs/linux.md)
- MCP: [docs/mcp.md](docs/mcp.md)
- OpenAI/Azure endpoints: [docs/openai-endpoints.md](docs/openai-endpoints.md)
- Manual smokes: [docs/manual-tests.md](docs/manual-tests.md)
- Releasing: [docs/RELEASING.md](docs/RELEASING.md)
