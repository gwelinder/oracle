# Bug: Agent mode enablement clicks Google/Gmail connector popup instead of tools menu

## Observed behavior

When running Oracle batch mode with `--browser-agent-mode on`, the agent mode enablement step sometimes clicks on a Google Apps / Gmail connector button/popup instead of the ChatGPT composer tools (+) button. This triggers a Gmail integration dialog that blocks the composer, causing the prompt submission to fail with:

```
Prompt did not appear in conversation before timeout (send may have failed)
```

The issue is **intermittent** — it happens on some tab initializations but not others within the same batch run. It is **persistent per CVR** — once a specific job triggers it, retrying that job keeps hitting the same failure.

## Environment

- Oracle v0.9.0 (patched dist)
- `--browser-manual-login` profile at `~/.oracle/browser-profile`
- ChatGPT Pro with Agent mode
- `--parallel 4` batch mode
- macOS, Chrome headless-ish (windowed with automation flags)

## Root cause hypothesis

In `src/browser/actions/agentMode.ts`, the `TOOL_BUTTON_SELECTORS` array includes very generic selectors:

```typescript
const TOOL_BUTTON_SELECTORS = [
  '#composer-plus-btn',
  'button[data-testid="composer-plus-btn"]',
  '[data-testid*="composer-plus"]',
  '[data-testid*="plus"]',
  'button[aria-label*="Tools"]',
  'button[aria-label*="tools"]',
  'button[aria-label*="add"]',
  'button[aria-label*="attachment"]',  // ← too generic
  'button[aria-label*="file"]',        // ← too generic
];
```

The selectors `button[aria-label*="attachment"]` and `button[aria-label*="file"]` can match buttons from:
- Google Workspace connector panels
- Gmail integration widgets
- Third-party ChatGPT plugins/connectors that happen to be visible

When ChatGPT shows a Google Apps integration panel (which can appear automatically when the user's Google account is linked and ChatGPT offers connector features), these generic selectors match the wrong button.

Additionally, `[data-testid*="plus"]` is extremely generic and could match any element with "plus" in a testid.

## Reproduction

1. Use a ChatGPT account that has Google Workspace / Gmail connected
2. Run Oracle batch with `--browser-agent-mode on --parallel 4`
3. Some tabs will click the Google Apps connector instead of the composer tools button
4. Those jobs fail with "Prompt did not appear in conversation before timeout"
5. Retrying the same jobs keeps failing because the connector dialog persists

## Suggested fix

1. **Tighten selectors**: Remove the overly generic fallbacks and prefer specific ChatGPT selectors:
   ```typescript
   const TOOL_BUTTON_SELECTORS = [
     '#composer-plus-btn',
     'button[data-testid="composer-plus-btn"]',
     '[data-testid*="composer-plus"]',
     // Remove: '[data-testid*="plus"]' — too generic
     // Remove: 'button[aria-label*="attachment"]' — matches Gmail/connector buttons  
     // Remove: 'button[aria-label*="file"]' — matches Gmail/connector buttons
   ];
   ```

2. **Scope to composer**: Before clicking, verify the matched button is inside the ChatGPT composer area:
   ```typescript
   const findToolsButton = () => {
     const composer = document.querySelector('[data-testid*="composer"]') || document.querySelector('form');
     if (!composer) return null;
     for (const selector of TOOL_BUTTON_SELECTORS) {
       const node = composer.querySelector(selector);
       if (node instanceof HTMLElement && isVisible(node)) return node;
     }
     return null;
   };
   ```

3. **Dismiss connector popups**: Before attempting agent mode, check for and dismiss any open Google Apps / connector dialogs.

4. **Add negative filter**: Skip buttons that are inside known connector/integration containers:
   ```typescript
   if (node.closest('[data-testid*="connector"], [data-testid*="integration"], [role="dialog"]')) continue;
   ```

## Workaround

For now, running with `--browser-agent-mode current` instead of `on` avoids the issue if agent mode is already enabled from a previous run. But this is fragile for batch mode where each tab starts fresh.

## Impact

In our overnight batch run of 235 companies, approximately 15-20% of jobs hit this failure. The failures are persistent — the same CVRs fail on every retry because the connector state persists in the tab.
