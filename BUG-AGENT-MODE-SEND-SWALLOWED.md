# Bug: Agent mode prompt send silently swallowed on fresh tab

## Observed behavior

When `--browser-agent-mode on` is used, the agent mode toggle succeeds (`Agent mode: enabled`), the prompt is typed into the textarea, and the send button is clicked. The composer clears (text disappears), but **ChatGPT does not create a conversation**. The message is silently dropped.

The verbose `prompt-commit` check shows:
```
composerCleared: true    ← text was removed from textarea
inConversation: false    ← but no conversation was created
hasNewTurn: false         ← no assistant turn appeared
userMatched: false        ← user message not found in DOM
```

## Reproduction

1. Kill Chrome, clean lock files
2. Launch with `--browser-agent-mode on --verbose`
3. Oracle logs show:
   - `Prompt textarea ready`
   - `Agent mode: enabled (Agent mode)`  
   - `Prompt textarea ready (after Agent mode on)`
   - `Clicked send button`
   - `Prompt commit check failed; composerCleared: true, inConversation: false`

## What works vs what doesn't

| Scenario | Result |
|----------|--------|
| `--browser-agent-mode off` + simple prompt | ✅ Works |
| `--browser-agent-mode off` + file attachment | ✅ Works |
| `--browser-agent-mode on` + simple prompt (fresh tab) | ❌ Swallowed |
| `--browser-agent-mode on` after 30+ successful runs | ❌ Swallowed (rate limit?) |
| `--browser-agent-mode on` on reused Chrome (primed) | ❌ Still swallowed |

## Root cause hypothesis

ChatGPT's agent mode has a different conversation initialization flow than standard mode. When the send button is clicked on a fresh `chatgpt.com` page (no existing conversation), the agent-mode composer may require:
1. A slight delay after toggling agent mode before the send button becomes functional
2. The page to be in a specific state (e.g., the agent-mode UI fully initialized)
3. A different send mechanism (Enter key vs button click)

The fact that `composerCleared: true` suggests the UI *appeared* to accept the input, but the backend didn't process it.

## Suggested fix

1. **Retry send on swallow detection**: When `composerCleared: true` but `inConversation: false`, retype the prompt and send again (possibly with Enter key instead of button click).

2. **Add post-toggle delay**: After `ensureAgentMode()` succeeds, wait 1-2 seconds before attempting to submit the prompt. The agent-mode UI may need time to fully initialize.

3. **Try Enter key fallback**: If button click + swallow detected, retry with `Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter' })`.

4. **Navigate to new conversation URL**: Instead of sending on `chatgpt.com`, navigate to `chatgpt.com/?model=gpt-5.4-pro&agent=on` or similar if such URL params exist.

## Impact

This blocks all remaining overnight batch enrichment runs (~73 companies). The first ~40 runs in a session work, but once the swallow pattern starts, it's persistent across Chrome restarts and cooldowns.
