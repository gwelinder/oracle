import CDP from 'chrome-remote-interface';
import type { BrowserRuntimeMetadata, BrowserSessionConfig } from '../sessionStore.js';
import { waitForAssistantResponse, captureAssistantMarkdown } from './pageActions.js';
import type { BrowserLogger, ChromeClient } from './types.js';

export interface ReattachDeps {
  listTargets?: () => Promise<TargetInfoLite[]>;
  connect?: (options?: unknown) => Promise<ChromeClient>;
  waitForAssistantResponse?: typeof waitForAssistantResponse;
  captureAssistantMarkdown?: typeof captureAssistantMarkdown;
}

export interface ReattachResult {
  answerText: string;
  answerMarkdown: string;
}

type TargetInfoLite = {
  targetId?: string;
  type?: string;
  url?: string;
  [key: string]: unknown;
};

function pickTarget(
  targets: TargetInfoLite[],
  runtime: BrowserRuntimeMetadata,
): TargetInfoLite | undefined {
  if (!Array.isArray(targets) || targets.length === 0) {
    return undefined;
  }
  if (runtime.chromeTargetId) {
    const byId = targets.find((t) => t.targetId === runtime.chromeTargetId);
    if (byId) return byId;
  }
  if (runtime.tabUrl) {
    const byUrl =
      targets.find((t) => t.url?.startsWith(runtime.tabUrl as string)) ||
      targets.find((t) => (runtime.tabUrl as string).startsWith(t.url || ''));
    if (byUrl) return byUrl;
  }
  return targets.find((t) => t.type === 'page') ?? targets[0];
}

export async function resumeBrowserSession(
  runtime: BrowserRuntimeMetadata,
  config: BrowserSessionConfig | undefined,
  logger: BrowserLogger,
  deps: ReattachDeps = {},
): Promise<ReattachResult> {
  if (!runtime.chromePort) {
    throw new Error('Missing chromePort; cannot reattach.');
  }
  const host = runtime.chromeHost ?? '127.0.0.1';
  const listTargets =
    deps.listTargets ??
    (async () => {
      const targets = await CDP.List({ host, port: runtime.chromePort as number });
      return targets as unknown as TargetInfoLite[];
    });
  const connect = deps.connect ?? ((options?: unknown) => CDP(options as CDP.Options));
  const targetList = (await listTargets()) as TargetInfoLite[];
  const target = pickTarget(targetList, runtime);
  const client: ChromeClient = (await connect({
    host,
    port: runtime.chromePort,
    target: target?.targetId,
  })) as unknown as ChromeClient;
  const { Runtime, DOM } = client;
  if (Runtime?.enable) {
    await Runtime.enable();
  }
  if (DOM && typeof DOM.enable === 'function') {
    await DOM.enable();
  }

  const waitForResponse = deps.waitForAssistantResponse ?? waitForAssistantResponse;
  const captureMarkdown = deps.captureAssistantMarkdown ?? captureAssistantMarkdown;
  const timeoutMs = config?.timeoutMs ?? 120_000;
  const answer = await waitForResponse(Runtime, timeoutMs, logger);
  const markdown = (await captureMarkdown(Runtime, answer.meta, logger)) ?? answer.text;

  if (client && typeof client.close === 'function') {
    try {
      await client.close();
    } catch {
      // ignore
    }
  }

  return { answerText: answer.text, answerMarkdown: markdown };
}
