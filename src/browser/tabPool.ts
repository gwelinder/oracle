import path from "node:path";
import type { ChromeClient, BrowserLogger, BrowserAttachment, ResolvedBrowserConfig } from "./types.js";
import { connectWithNewTab, closeTab } from "./chromeLifecycle.js";
import {
  navigateToChatGPT,
  ensureNotBlocked,
  ensureLoggedIn,
  ensurePromptReady,
  ensureAgentMode,
  waitForAssistantResponse,
  captureAssistantMarkdown,
  extractExpandedAssistantText,
  readAssistantSnapshot,
  installJavaScriptDialogAutoDismissal,
} from "./pageActions.js";
import { submitPrompt, clearPromptComposer } from "./actions/promptComposer.js";
import { delay, estimateTokenCount, withRetries } from "./utils.js";
import { CHATGPT_URL, CONVERSATION_TURN_SELECTOR } from "./constants.js";
import type { ProfileRunLock } from "./profileState.js";
import { acquireProfileRunLock } from "./profileState.js";
import { formatElapsed } from "../oracle/format.js";

export interface BatchJob {
  slug: string;
  prompt: string;
  files?: string[];
  writeOutput?: string;
}

export interface BatchJobResult {
  slug: string;
  status: "completed" | "error";
  answerText: string;
  elapsedMs: number;
  error?: string;
  outputTokens: number;
}

export interface TabPoolOptions {
  maxConcurrent: number;
  chromePort: number;
  chromeHost: string;
  config: ResolvedBrowserConfig;
  userDataDir: string;
  logger: BrowserLogger;
  verbose: boolean;
  onJobStart?: (slug: string, workerIndex: number) => void;
  onJobComplete?: (result: BatchJobResult, completed: number, total: number) => void;
}

export interface BatchResult {
  results: BatchJobResult[];
  completed: number;
  failed: number;
  elapsedMs: number;
}

export async function runBatchInParallel(
  jobs: BatchJob[],
  options: TabPoolOptions,
): Promise<BatchResult> {
  const startedAt = Date.now();
  const results: BatchJobResult[] = [];
  const queue = [...jobs];
  let completedCount = 0;
  const total = jobs.length;

  const workers = Array.from({ length: Math.min(options.maxConcurrent, jobs.length) }, (_, i) =>
    runWorker(i, queue, results, options, () => {
      completedCount += 1;
      return { completed: completedCount, total };
    }),
  );

  await Promise.all(workers);

  return {
    results,
    completed: results.filter((r) => r.status === "completed").length,
    failed: results.filter((r) => r.status === "error").length,
    elapsedMs: Date.now() - startedAt,
  };
}

async function runWorker(
  workerIndex: number,
  queue: BatchJob[],
  results: BatchJobResult[],
  options: TabPoolOptions,
  onComplete: () => { completed: number; total: number },
): Promise<void> {
  while (queue.length > 0) {
    const job = queue.shift();
    if (!job) break;

    options.onJobStart?.(job.slug, workerIndex);
    const jobStart = Date.now();
    let result: BatchJobResult;

    try {
      const answerText = await runJobInTab(job, workerIndex, options);
      result = {
        slug: job.slug,
        status: "completed",
        answerText,
        elapsedMs: Date.now() - jobStart,
        outputTokens: estimateTokenCount(answerText),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      options.logger(`[tab-${workerIndex}] Job ${job.slug} failed: ${message}`);
      result = {
        slug: job.slug,
        status: "error",
        answerText: "",
        elapsedMs: Date.now() - jobStart,
        error: message,
        outputTokens: 0,
      };
    }

    results.push(result);
    const progress = onComplete();
    options.onJobComplete?.(result, progress.completed, progress.total);

    // Brief cooldown between jobs to avoid rate limits
    await delay(2000);
  }
}

async function runJobInTab(
  job: BatchJob,
  workerIndex: number,
  options: TabPoolOptions,
): Promise<string> {
  const { chromePort, chromeHost, config, userDataDir, verbose } = options;
  const prefix = `[tab-${workerIndex}/${job.slug}]`;
  const parentLogger = options.logger;
  const logger: BrowserLogger = ((msg: string) => {
    if (verbose) parentLogger(`${prefix} ${msg}`);
  }) as BrowserLogger;
  logger.verbose = verbose;
  logger.sessionLog = verbose ? parentLogger : undefined;

  // Open isolated tab
  const connection = await connectWithNewTab(chromePort, logger, undefined, chromeHost, {
    fallbackToDefault: false,
    retries: 3,
    retryDelayMs: 1000,
  });
  const client = connection.client;
  const targetId = connection.targetId;

  // Track CDP disconnects — agent-mode browsing can trigger tab navigations
  // that close the inspected target. Without this handler, the disconnect event
  // becomes an unhandled error that crashes the entire Node process.
  let disconnected = false;
  const disconnectPromise = new Promise<never>((_, reject) => {
    client.on("disconnect", () => {
      disconnected = true;
      reject(new Error(`CDP disconnected for ${job.slug}`));
    });
  });
  const raceDisconnect = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([promise, disconnectPromise]);

  try {
    const { Network, Page, Runtime, Input, DOM } = client;

    // Enable CDP domains
    const domainEnablers = [Network.enable({}), Page.enable(), Runtime.enable()];
    if (DOM && typeof DOM.enable === "function") {
      domainEnablers.push(DOM.enable());
    }
    await Promise.all(domainEnablers);

    const removeDialogHandler = installJavaScriptDialogAutoDismissal(Page, logger);

    try {
      // Navigate to ChatGPT
      const url = config.url ?? CHATGPT_URL;
      await raceDisconnect(navigateToChatGPT(Page, Runtime, url, logger));
      await raceDisconnect(ensureNotBlocked(Runtime, false, logger));
      await raceDisconnect(ensureLoggedIn(Runtime, logger, { appliedCookies: 1 }));
      await raceDisconnect(ensurePromptReady(Runtime, config.inputTimeoutMs ?? 60_000, logger));

      // Agent mode
      const agentMode = config.agentMode ?? "current";
      let connectorDismissed = false;
      if (agentMode !== "current") {
        const agentResult = await raceDisconnect(
          withRetries(() => ensureAgentMode(Runtime, Input, agentMode, logger), {
            retries: 2,
            delayMs: 500,
          }),
        );
        connectorDismissed = agentResult?.connectorDismissed ?? false;

        if (connectorDismissed) {
          // Connector dialog was dismissed — composer state may be disrupted.
          // Wait for the dialog to fully close, clear any stale composer content,
          // and re-verify prompt readiness before submitting.
          parentLogger(`${prefix} Connector dialog dismissed; re-preparing composer`);
          await delay(1000);
          await raceDisconnect(clearPromptComposer(Runtime, logger)).catch(() => undefined);
        }
        await raceDisconnect(
          ensurePromptReady(Runtime, config.inputTimeoutMs ?? 60_000, logger),
        );
      }

      // Post-agent-mode stabilization: ChatGPT's agent-mode composer can take
      // a moment to fully initialize after the toggle. Without this delay, the
      // send can be silently swallowed (composerCleared: true, inConversation: false).
      if (agentMode === "on") {
        await delay(2000);
        await raceDisconnect(
          ensurePromptReady(Runtime, config.inputTimeoutMs ?? 60_000, logger),
        );
      }

      // Read baseline turn count
      const baselineTurns = await readTurnCount(Runtime).catch(() => null);

      // Submit prompt with retry on swallow detection.
      // Agent mode can silently swallow sends — composer clears but no conversation is created.
      // On failure: clear composer, wait, retype, and retry with Enter key fallback.
      const MAX_SEND_ATTEMPTS = 3;
      let submitted = false;
      for (let attempt = 0; attempt < MAX_SEND_ATTEMPTS; attempt++) {
        // Acquire profile lock to serialize prompt submissions across tabs
        let profileLock: ProfileRunLock | null = null;
        const lockTimeout = config.profileLockTimeoutMs ?? 300_000;
        if (lockTimeout > 0) {
          profileLock = await acquireProfileRunLock(userDataDir, {
            timeoutMs: lockTimeout,
            logger: parentLogger,
          });
        }

        try {
          await raceDisconnect(
            submitPrompt(
              {
                runtime: Runtime,
                input: Input,
                attachmentNames: [],
                baselineTurns: baselineTurns ?? undefined,
                inputTimeoutMs: config.inputTimeoutMs ?? undefined,
              },
              job.prompt,
              logger,
            ),
          );
          submitted = true;
          break;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const isSwallowed =
            msg.includes("did not appear in conversation") || msg.includes("send may have failed");

          if (!isSwallowed || attempt >= MAX_SEND_ATTEMPTS - 1) {
            throw error;
          }

          parentLogger(
            `${prefix} Send swallowed (attempt ${attempt + 1}/${MAX_SEND_ATTEMPTS}); retrying...`,
          );

          // Clear, wait, re-prepare, and retry
          await raceDisconnect(clearPromptComposer(Runtime, logger)).catch(() => undefined);
          await delay(2000);
          await raceDisconnect(
            ensurePromptReady(Runtime, config.inputTimeoutMs ?? 60_000, logger),
          );
        } finally {
          if (profileLock) {
            await profileLock.release().catch(() => undefined);
          }
        }
      }

      if (!submitted) {
        throw new Error("Prompt submission failed after all retry attempts");
      }

      parentLogger(`${prefix} Prompt submitted, waiting for response...`);

      // Wait for response — agent mode can take 5-30 minutes
      const timeoutMs = config.timeoutMs ?? 1_200_000;
      const answer = await raceDisconnect(
        waitForAssistantResponse(Runtime, timeoutMs, logger, baselineTurns ?? undefined),
      );

      let answerText = answer.text ?? "";

      // Try copy button for markdown
      const copiedMarkdown = await captureAssistantMarkdown(Runtime, answer.meta, logger).catch(
        () => null,
      );
      if (copiedMarkdown && copiedMarkdown.length >= answerText.length) {
        answerText = copiedMarkdown;
      }

      // Agent-mode file-pointer expansion
      const isFilePointer =
        answerText.trim().length < 300 &&
        (/\{\{file[:\-]/.test(answerText) ||
          /attached file/i.test(answerText) ||
          /available in the attached/i.test(answerText));
      if (isFilePointer) {
        const expanded = await extractExpandedAssistantText(
          Runtime,
          baselineTurns ?? undefined,
        ).catch(() => null);
        if (expanded && expanded.length > answerText.trim().length * 2) {
          parentLogger(
            `${prefix} Expanded file response (${answerText.trim().length} → ${expanded.length} chars)`,
          );
          answerText = expanded;
        }
      }

      // Final snapshot check for longer content
      if (answerText.trim().length > 0 && answerText.trim().length < 200) {
        const finalSnapshot = await readAssistantSnapshot(
          Runtime,
          baselineTurns ?? undefined,
        ).catch(() => null);
        const finalText =
          typeof finalSnapshot?.text === "string" ? finalSnapshot.text.trim() : "";
        if (finalText.length > answerText.trim().length) {
          answerText = finalText;
        }
      }

      return answerText;
    } finally {
      removeDialogHandler?.();
    }
  } finally {
    // Close isolated tab (best-effort; may already be gone if disconnected)
    if (targetId && !disconnected) {
      await closeTab(chromePort, targetId, logger, chromeHost).catch(() => undefined);
    }
    try {
      if (!disconnected) await client.close();
    } catch {
      // ignore
    }
  }
}

async function readTurnCount(Runtime: ChromeClient["Runtime"]): Promise<number | null> {
  const selectorLiteral = JSON.stringify(CONVERSATION_TURN_SELECTOR);
  try {
    const { result } = await Runtime.evaluate({
      expression: `document.querySelectorAll(${selectorLiteral}).length`,
      returnByValue: true,
    });
    const raw = typeof result?.value === "number" ? result.value : Number(result?.value);
    return Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : null;
  } catch {
    return null;
  }
}
