# Multi-Model Seams – November 19, 2025

## Storage API boundary
- Current code exposes raw file paths (`meta.json`, `models/<name>.json`, legacy `session.json`) directly to CLI helpers, tests, and MCP tooling.
- Refactor goal: introduce a thin storage service (e.g., `SessionStore`) that owns upgrade logic, path discovery, and read/write methods so callers never touch the filesystem tree directly.
- Benefits: easier to evolve format again (or support remote storage), centralizes validation, reduces duplicated `fs` calls sprinkled throughout CLI and tests.

## Run orchestration seam
- `performSessionRun` now contains both single-model logic and the new multi-model fan-out flow; it handles logging, notifications, and aggregated stats in one large function.
- Refactor goal: extract a dedicated `runMultiModelSession` module that encapsulates scheduling, concurrency, and per-model log piping; the CLI would only choose between browser/api/multi orchestrators.
- Benefits: isolates concurrency concerns for future enhancements (per-provider throttling, retries, streaming improvements) and simplifies unit testing/external reuse (e.g., MCP tools calling fan-out programmatically).
