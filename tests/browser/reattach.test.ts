import { describe, expect, test, vi } from 'vitest';
import { resumeBrowserSession } from '../../src/browser/reattach.js';
import type { BrowserLogger, ChromeClient } from '../../src/browser/types.js';

type FakeTarget = { targetId?: string; type?: string; url?: string };
type FakeClient = {
  // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
  Runtime: { enable: () => void };
  // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
  DOM: { enable: () => void };
  close: () => void;
};

describe('resumeBrowserSession', () => {
  test('selects target and captures markdown via stubs', async () => {
    const runtime = {
      chromePort: 51559,
      chromeHost: '127.0.0.1',
      chromeTargetId: 'target-1',
      tabUrl: 'https://chatgpt.com/c/abc',
    };
    const listTargets = vi.fn(async () =>
      [
        { targetId: 'target-1', type: 'page', url: runtime.tabUrl },
        { targetId: 'target-2', type: 'page', url: 'about:blank' },
      ] satisfies FakeTarget[],
    ) as unknown as () => Promise<FakeTarget[]>;
    const connect = vi.fn(async () =>
      ({
        // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
        Runtime: { enable: vi.fn() },
        // biome-ignore lint/style/useNamingConvention: mirrors DevTools protocol domain names
        DOM: { enable: vi.fn() },
        close: vi.fn(),
      } satisfies FakeClient),
    ) as unknown as (options?: unknown) => Promise<ChromeClient>;
    const waitForAssistantResponse = vi.fn(async () => ({
      text: 'Hello PATH plan',
      html: '',
      meta: { messageId: 'm1', turnId: 'conversation-turn-1' },
    }));
    const captureAssistantMarkdown = vi.fn(async () => 'markdown response');
    const logger = vi.fn() as BrowserLogger;
    logger.verbose = true;

    const result = await resumeBrowserSession(
      runtime,
      { timeoutMs: 2000 },
      logger,
      { listTargets, connect, waitForAssistantResponse, captureAssistantMarkdown },
    );

    expect(result.answerMarkdown).toBe('markdown response');
    expect(connect).toHaveBeenCalledWith(
      expect.objectContaining({ host: '127.0.0.1', port: 51559, target: 'target-1' }),
    );
    expect(waitForAssistantResponse).toHaveBeenCalled();
    expect(captureAssistantMarkdown).toHaveBeenCalled();
  });
});
