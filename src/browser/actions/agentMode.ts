import type { ChromeClient, BrowserLogger, BrowserAgentMode } from "../types.js";
import { MENU_CONTAINER_SELECTOR, MENU_ITEM_SELECTOR } from "../constants.js";
import { logDomFailure } from "../domDebug.js";
import { buildClickDispatcher } from "./domEvents.js";

type AgentModeOutcome =
  | { status: "already-on"; label?: string | null }
  | { status: "already-off"; label?: string | null }
  | { status: "switched-on"; label?: string | null }
  | { status: "switched-off"; label?: string | null }
  | { status: "tools-button-missing" }
  | { status: "menu-not-found" }
  | { status: "option-not-found" }
  | { status: "ambiguous-off-state"; label?: string | null };

/**
 * Enables/disables ChatGPT Agent mode through the composer tools menu.
 * - on: ensure agent mode is enabled
 * - off: ensure agent mode is disabled
 * - current: no-op
 */
export interface AgentModeResult {
  /** Whether a connector dialog was dismissed (may need prompt re-preparation). */
  connectorDismissed: boolean;
}

export async function ensureAgentMode(
  Runtime: ChromeClient["Runtime"],
  mode: BrowserAgentMode,
  logger: BrowserLogger,
): Promise<AgentModeResult> {
  if (mode === "current") {
    logger("Agent mode: keeping current state");
    return { connectorDismissed: false };
  }

  const outcome = await Runtime.evaluate({
    expression: buildAgentModeExpression(mode),
    awaitPromise: true,
    returnByValue: true,
  });

  // Post-action: dismiss any connector dialog that may have appeared with a delay.
  // The "Using agent mode with connectors" dialog can render after the expression returns.
  // Returns true if a connector dialog was dismissed (caller should re-prepare the composer).
  const dismissPostAction = async (): Promise<boolean> => {
    let dismissed = false;
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 400));
      const r = await Runtime.evaluate({
        expression: `(() => {
          ${buildClickDispatcher()}
          const normalize = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
          const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
            (el) => el instanceof HTMLElement && el.getBoundingClientRect().width > 0
          );
          for (const d of dialogs) {
            const text = normalize(d.textContent || '');
            if (!text.includes('connector')) continue;
            const buttons = Array.from(d.querySelectorAll('button'));
            const turnOff = buttons.find((b) => normalize(b.textContent || '').includes('turn off') || normalize(b.textContent || '').includes('sluk') || normalize(b.textContent || '').includes('deaktiver'));
            if (turnOff) { dispatchClickSequence(turnOff); return 'dismissed-turn-off'; }
            const accept = buttons.find((b) => normalize(b.textContent || '').includes('i understand') || normalize(b.textContent || '').includes('ok'));
            if (accept) { dispatchClickSequence(accept); return 'dismissed-accept'; }
            const xBtn = d.querySelector('button:has(svg)');
            if (xBtn && (xBtn.textContent || '').trim().length < 3) { dispatchClickSequence(xBtn); return 'dismissed-x'; }
          }
          return 'none';
        })()`,
        returnByValue: true,
      }).catch(() => ({ result: { value: "error" } }));
      const v = typeof r.result?.value === "string" ? r.result.value : "error";
      if (v.startsWith("dismissed")) {
        logger(`Connector dialog dismissed (${v})`);
        dismissed = true;
        break;
      }
    }
    return dismissed;
  };

  const result = outcome.result?.value as AgentModeOutcome | undefined;
  switch (result?.status) {
    case "already-on": {
      logger(`Agent mode: on${result.label ? ` (${result.label})` : ""}`);
      const connectorDismissed = await dismissPostAction();
      return { connectorDismissed };
    }
    case "already-off":
      logger(`Agent mode: off${result.label ? ` (${result.label})` : ""}`);
      return { connectorDismissed: false };
    case "switched-on": {
      logger(`Agent mode: enabled${result.label ? ` (${result.label})` : ""}`);
      const connectorDismissed = await dismissPostAction();
      return { connectorDismissed };
    }
    case "switched-off":
      logger(`Agent mode: disabled${result.label ? ` (${result.label})` : ""}`);
      return { connectorDismissed: false };
    case "menu-not-found":
      await logDomFailure(Runtime, logger, "agent-mode-menu");
      throw new Error("Unable to open the ChatGPT tools menu to set Agent mode.");
    case "tools-button-missing":
      await logDomFailure(Runtime, logger, "agent-mode-tools-button");
      throw new Error("Unable to locate the ChatGPT tools (+) button for Agent mode.");
    case "ambiguous-off-state":
      await logDomFailure(Runtime, logger, "agent-mode-ambiguous-off");
      throw new Error(
        "Unable to safely disable Agent mode because the current state could not be verified.",
      );
    case "option-not-found":
    default:
      await logDomFailure(Runtime, logger, "agent-mode-option");
      throw new Error("Unable to find an Agent mode option in the ChatGPT tools menu.");
  }
}

function buildAgentModeExpression(mode: Exclude<BrowserAgentMode, "current">): string {
  const targetModeLiteral = JSON.stringify(mode);
  const menuContainerLiteral = JSON.stringify(MENU_CONTAINER_SELECTOR);
  const menuItemLiteral = JSON.stringify(MENU_ITEM_SELECTOR);

  return `(async () => {
    ${buildClickDispatcher()}
    const TARGET_MODE = ${targetModeLiteral};
    const MENU_CONTAINER_SELECTOR = ${menuContainerLiteral};
    const MENU_ITEM_SELECTOR = ${menuItemLiteral};
    // Selectors for the ChatGPT composer tools (+) button.
    // Keep these specific — generic selectors like [aria-label*="attachment"] or
    // [data-testid*="plus"] match Google Workspace / Gmail connector buttons that
    // appear when the user's Google account is linked.
    const TOOL_BUTTON_SELECTORS = [
      '#composer-plus-btn',
      'button[data-testid="composer-plus-btn"]',
      '[data-testid*="composer-plus"]',
    ];

    // Containers that indicate a connector/integration popup — skip buttons inside these.
    const CONNECTOR_EXCLUSION = '[data-testid*="connector"], [data-testid*="integration"], [data-testid*="plugin"], [role="dialog"], [data-testid*="google"], [data-testid*="gmail"]';

    const INITIAL_WAIT_MS = 160;
    const MAX_WAIT_MS = 12000;
    const REOPEN_INTERVAL_MS = 450;
    const WAIT_BETWEEN_SCANS_MS = 120;
    const POST_CLICK_WAIT_MS = 280;

    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9\u00C0-\u024F\u0400-\u04FF]+/g, ' ')
        .replace(/\\s+/g, ' ')
        .trim();

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(node);
      if (!style) return false;
      if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
        return false;
      }
      return true;
    };

    const textFor = (node) =>
      normalize(
        [
          node?.textContent || '',
          node?.getAttribute?.('aria-label') || '',
          node?.getAttribute?.('data-testid') || '',
          node?.getAttribute?.('title') || '',
        ].join(' '),
      );

    const AGENT_KEYWORDS = [
      'agent mode',
      'agentmode',
      'agent mode on',
      'agent mode off',
      'agent tilstand',
      'agenttilstand',
      'mode agent',
      'modo agente',
      'agent modus',
      'agentmodus',
      'modus agent',
    ];

    const matchesAgent = (text) => {
      if (!text) return false;
      if (AGENT_KEYWORDS.some((token) => text.includes(token))) return true;
      if (text.includes('agent') && (text.includes('mode') || text.includes('tilstand') || text.includes('modus') || text.includes('modo') || text.includes('mod'))) {
        return true;
      }
      return false;
    };

    const optionIsSelected = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const ariaChecked = node.getAttribute('aria-checked');
      const ariaSelected = node.getAttribute('aria-selected');
      const ariaCurrent = node.getAttribute('aria-current');
      const ariaPressed = node.getAttribute('aria-pressed');
      const dataSelected = node.getAttribute('data-selected');
      const dataState = (node.getAttribute('data-state') || '').toLowerCase();
      if (
        ariaChecked === 'true' ||
        ariaSelected === 'true' ||
        ariaCurrent === 'true' ||
        ariaPressed === 'true' ||
        dataSelected === 'true'
      ) {
        return true;
      }
      if (['checked', 'selected', 'on', 'active', 'true'].includes(dataState)) {
        return true;
      }
      return false;
    };

    const readComposerAgentState = () => {
      const root =
        document.querySelector('[data-testid*="composer"]') ||
        document.querySelector('form') ||
        document.body;
      if (!root) return null;
      const candidates = Array.from(
        root.querySelectorAll(
          'button,[role="button"],[aria-pressed],[aria-checked],[data-testid*="pill"],[data-testid*="tool"]',
        ),
      );
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) continue;
        if (!isVisible(node)) continue;
        if (node.closest('[role="menu"], [data-radix-collection-root]')) continue;
        const text = textFor(node);
        if (!matchesAgent(text)) continue;
        if (optionIsSelected(node)) return true;
        // If an explicit Agent-mode button/chip exists in composer controls, treat it as enabled.
        return true;
      }
      return null;
    };

    const dismissConnectorPopups = () => {
      // Dismiss any open connector/integration dialogs that overlay the composer.
      // Priority targets:
      // 1. "Using agent mode with connectors" dialog — click "Turn off connectors"
      //    to prevent connectors from interfering with automation.
      // 2. Generic integration/connector popups — close button or Escape.

      const allDialogs = Array.from(document.querySelectorAll(
        '[role="dialog"], [data-testid*="connector"], [data-testid*="integration"], [data-testid*="plugin"], [data-testid*="modal"]'
      )).filter((el) => el instanceof HTMLElement && isVisible(el));

      for (const dialog of allDialogs) {
        const dialogText = normalize(dialog.textContent || '');

        // "Using agent mode with connectors" dialog
        if (dialogText.includes('agent mode') && dialogText.includes('connector')) {
          // Prefer "Turn off connectors" to keep automation clean
          const buttons = Array.from(dialog.querySelectorAll('button'));
          const turnOff = buttons.find((b) => {
            const label = normalize(b.textContent || '');
            return label.includes('turn off') || label.includes('sluk') || label.includes('deaktiver') || label.includes('disable');
          });
          if (turnOff instanceof HTMLElement) {
            dispatchClickSequence(turnOff);
            continue;
          }
          // Fallback: "I understand" / close button / X
          const accept = buttons.find((b) => {
            const label = normalize(b.textContent || '');
            return label.includes('i understand') || label.includes('forstår') || label.includes('ok') || label.includes('got it');
          });
          if (accept instanceof HTMLElement) {
            dispatchClickSequence(accept);
            continue;
          }
        }

        // Generic close: X button, close label, or Escape
        const closeBtn = dialog.querySelector(
          'button[aria-label*="close"], button[aria-label*="Close"], button[aria-label*="dismiss"], button[aria-label*="cancel"], button[aria-label*="Luk"]'
        );
        if (closeBtn instanceof HTMLElement) {
          dispatchClickSequence(closeBtn);
          continue;
        }
        // Try the X button (often the first/only button with just an SVG)
        const xBtn = dialog.querySelector('button:has(svg)');
        if (xBtn instanceof HTMLElement && (xBtn.textContent || '').trim().length < 3) {
          dispatchClickSequence(xBtn);
          continue;
        }
        try {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true }));
        } catch {}
      }
    };

    const findToolsButton = () => {
      // Scope search to the ChatGPT composer area to avoid clicking connector/integration buttons
      const composerRoots = [
        document.querySelector('[data-testid*="composer"]'),
        document.querySelector('form'),
      ].filter(Boolean);
      const searchRoot = composerRoots[0] || document;

      for (const selector of TOOL_BUTTON_SELECTORS) {
        const node = searchRoot.querySelector(selector);
        if (!(node instanceof HTMLElement)) continue;
        if (!isVisible(node)) continue;
        // Skip buttons inside connector/integration containers
        if (node.closest(CONNECTOR_EXCLUSION)) continue;
        return node;
      }

      // Fallback: if the composer-scoped search missed, try document-wide but with strict filtering
      if (searchRoot !== document) {
        for (const selector of TOOL_BUTTON_SELECTORS) {
          const node = document.querySelector(selector);
          if (!(node instanceof HTMLElement)) continue;
          if (!isVisible(node)) continue;
          if (node.closest(CONNECTOR_EXCLUSION)) continue;
          return node;
        }
      }

      return null;
    };

    const clickToolsButton = () => {
      const button = findToolsButton();
      if (!button) return false;
      dispatchClickSequence(button);
      return true;
    };

    const collectMenuItems = () => {
      const roots = Array.from(document.querySelectorAll(MENU_CONTAINER_SELECTOR));
      if (!roots.length) return [];
      const itemSelector =
        MENU_ITEM_SELECTOR + ', [role="menuitemcheckbox"], [role="menuitemradio"]';
      const out = [];
      const seen = new Set();
      for (const root of roots) {
        const items = Array.from(root.querySelectorAll(itemSelector));
        for (const node of items) {
          if (!(node instanceof HTMLElement)) continue;
          if (!isVisible(node)) continue;
          if (seen.has(node)) continue;
          seen.add(node);
          out.push(node);
        }
      }
      return out;
    };

    const findAgentOption = () => {
      const items = collectMenuItems();
      let best = null;
      for (const item of items) {
        const text = textFor(item);
        if (!matchesAgent(text)) continue;
        const testId = normalize(item.getAttribute('data-testid') || '');
        let score = 0;
        if (testId.includes('agent')) score += 500;
        if (text.includes('agent mode') || text.includes('agenttilstand')) score += 300;
        if (text.includes('agent')) score += 150;
        const label = (item.textContent || '').trim();
        const selected = optionIsSelected(item);
        if (!best || score > best.score) {
          best = { node: item, label, selected, score };
        }
      }
      return best;
    };

    const submenuSeen = new Set();
    const openAnySubmenu = () => {
      const items = collectMenuItems();
      for (const item of items) {
        const hasPopup = normalize(item.getAttribute('aria-haspopup') || '') === 'menu';
        if (!hasPopup) continue;
        const signature =
          normalize(item.getAttribute('data-testid') || '') +
          '|' +
          normalize(item.textContent || '');
        if (submenuSeen.has(signature)) continue;
        submenuSeen.add(signature);
        dispatchClickSequence(item);
        return true;
      }
      return false;
    };

    const openMenuRoots = () => document.querySelector(MENU_CONTAINER_SELECTOR);

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    // Dismiss any connector/integration popups that might overlay the composer
    dismissConnectorPopups();
    await wait(100);

    if (!clickToolsButton()) {
      return { status: 'tools-button-missing' };
    }

    await wait(INITIAL_WAIT_MS);

    const initialComposerState = readComposerAgentState();
    const start = performance.now();
    let lastMenuOpenClick = performance.now();
    let sawMenu = Boolean(openMenuRoots());

    while (performance.now() - start < MAX_WAIT_MS) {
      const menuVisible = Boolean(openMenuRoots());
      if (menuVisible) {
        sawMenu = true;
      }

      const match = findAgentOption();
      if (match) {
        if (TARGET_MODE === 'on') {
          if (match.selected || initialComposerState === true) {
            // Even if already on, dismiss any lingering connector dialog
            dismissConnectorPopups();
            return { status: 'already-on', label: match.label };
          }
          dispatchClickSequence(match.node);
          await wait(POST_CLICK_WAIT_MS);
          // Agent mode toggle can trigger "Using agent mode with connectors" dialog —
          // dismiss it immediately by clicking "Turn off connectors".
          dismissConnectorPopups();
          // Wait a bit more and dismiss again in case the dialog renders late
          await wait(500);
          dismissConnectorPopups();
          return { status: 'switched-on', label: match.label };
        }

        // TARGET_MODE === 'off'
        if (match.selected === false || initialComposerState === false) {
          return { status: 'already-off', label: match.label };
        }
        if (match.selected || initialComposerState === true) {
          dispatchClickSequence(match.node);
          await wait(POST_CLICK_WAIT_MS);
          return { status: 'switched-off', label: match.label };
        }
        return { status: 'ambiguous-off-state', label: match.label };
      }

      if (!menuVisible && performance.now() - lastMenuOpenClick >= REOPEN_INTERVAL_MS) {
        // Dismiss any connector popups that appeared after the last click
        dismissConnectorPopups();
        await wait(80);
        if (!clickToolsButton()) {
          return { status: 'tools-button-missing' };
        }
        lastMenuOpenClick = performance.now();
        await wait(INITIAL_WAIT_MS);
        continue;
      }

      if (openAnySubmenu()) {
        await wait(INITIAL_WAIT_MS);
        continue;
      }

      await wait(WAIT_BETWEEN_SCANS_MS);
    }

    if (!sawMenu) {
      return { status: 'menu-not-found' };
    }
    return { status: 'option-not-found' };
  })()`;
}

export function buildAgentModeExpressionForTest(
  mode: Exclude<BrowserAgentMode, "current"> = "on",
): string {
  return buildAgentModeExpression(mode);
}
