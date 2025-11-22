#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CMD=(node "$ROOT/dist/bin/oracle-cli.js" --engine browser --browser-headless --wait --heartbeat 0 --timeout 900 --browser-input-timeout 120000)

tmpfile="$(mktemp /tmp/oracle-browser-smoke-XXXX.txt)"
echo "smoke-attachment" >"$tmpfile"

echo "[browser-smoke] pro simple"
"${CMD[@]}" --model gpt-5.1-pro --prompt "Return exactly one markdown bullet: '- pro-ok'." --slug browser-smoke-pro

echo "[browser-smoke] instant with attachment preview (inline)"
"${CMD[@]}" --model "5.1 Instant" --browser-inline-files --prompt "Read the attached file and return exactly one markdown bullet '- file: <content>' where <content> is the file text." --file "$tmpfile" --slug browser-smoke-file --preview

echo "[browser-smoke] pro upload attachment (non-inline)"
"${CMD[@]}" --model gpt-5.1-pro --prompt "Read the attached file and return exactly one markdown bullet '- upload: <content>' where <content> is the file text." --file "$tmpfile" --slug browser-smoke-upload

echo "[browser-smoke] standard markdown check"
"${CMD[@]}" --model gpt-5.1 --prompt "Return two markdown bullets and a fenced code block labeled js that logs 'thinking-ok'." --slug browser-smoke-thinking

rm -f "$tmpfile"
