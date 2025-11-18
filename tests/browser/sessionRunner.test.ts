import { describe, expect, test, vi } from 'vitest';
import type { RunOracleOptions } from '../../src/oracle.js';
import type { BrowserSessionConfig } from '../../src/sessionManager.js';
import { runBrowserSessionExecution } from '../../src/browser/sessionRunner.js';
import { BrowserAutomationError } from '../../src/oracle/errors.js';
import { getCliVersion } from '../../src/version.js';

const baseRunOptions: RunOracleOptions = {
  prompt: 'Hello world',
  model: 'gpt-5-pro',
  file: [],
  silent: false,
};

const baseConfig: BrowserSessionConfig = {};
const cliVersion = getCliVersion();

describe('runBrowserSessionExecution', () => {
  test('logs stats and returns usage/runtime', async () => {
    const log = vi.fn();
    const result = await runBrowserSessionExecution(
      {
        runOptions: baseRunOptions,
        browserConfig: baseConfig,
        cwd: '/repo',
        log,
        cliVersion,
      },
      {
        assemblePrompt: async () => ({
          markdown: 'prompt',
          composerText: 'prompt',
          estimatedInputTokens: 42,
          attachments: [],
          inlineFileCount: 0,
          tokenEstimateIncludesInlineFiles: false,
        }),
        executeBrowser: async () => ({
          answerText: 'ok',
          answerMarkdown: 'ok',
          tookMs: 1000,
          answerTokens: 12,
          answerChars: 20,
        }),
      },
    );
    expect(result.usage).toEqual({ inputTokens: 42, outputTokens: 12, reasoningTokens: 0, totalTokens: 54 });
    expect(result.runtime).toMatchObject({ chromePid: undefined });
    expect(log).toHaveBeenCalled();
  });

  test('respects verbose logging', async () => {
    const log = vi.fn();
    await runBrowserSessionExecution(
      {
        runOptions: { ...baseRunOptions, verbose: true },
        browserConfig: { keepBrowser: true },
        cwd: '/repo',
        log,
        cliVersion,
      },
      {
        assemblePrompt: async () => ({
          markdown: 'prompt',
          composerText: 'prompt',
          estimatedInputTokens: 1,
          attachments: [{ path: '/repo/a.txt', displayPath: 'a.txt', sizeBytes: 1024 }],
          inlineFileCount: 0,
          tokenEstimateIncludesInlineFiles: false,
        }),
        executeBrowser: async () => ({
          answerText: 'text',
          answerMarkdown: 'markdown',
          tookMs: 10,
          answerTokens: 1,
          answerChars: 5,
        }),
      },
    );
    expect(log.mock.calls.some((call) => String(call[0]).includes('Browser attachments'))).toBe(true);
  });

  test('passes heartbeat interval through to browser runner', async () => {
    const log = vi.fn();
    const executeBrowser = vi.fn(async () => ({
      answerText: 'text',
      answerMarkdown: 'markdown',
      tookMs: 10,
      answerTokens: 1,
      answerChars: 5,
    }));
    await runBrowserSessionExecution(
      {
        runOptions: { ...baseRunOptions, heartbeatIntervalMs: 15_000 },
        browserConfig: baseConfig,
        cwd: '/repo',
        log,
        cliVersion,
      },
      {
        assemblePrompt: async () => ({
          markdown: 'prompt',
          composerText: 'prompt',
          estimatedInputTokens: 5,
          attachments: [],
          inlineFileCount: 0,
          tokenEstimateIncludesInlineFiles: false,
        }),
        executeBrowser,
      },
    );
    expect(executeBrowser).toHaveBeenCalledWith(
      expect.objectContaining({ heartbeatIntervalMs: 15_000 }),
    );
  });

  test('throws when attempting to use Gemini in browser mode', async () => {
    const log = vi.fn();
    await expect(
      runBrowserSessionExecution(
        {
          runOptions: { ...baseRunOptions, model: 'gemini-3-pro' },
          browserConfig: baseConfig,
          cwd: '/repo',
          log,
          cliVersion,
        },
        {
          assemblePrompt: async () => ({ markdown: 'prompt', composerText: 'prompt', estimatedInputTokens: 1, attachments: [], inlineFileCount: 0, tokenEstimateIncludesInlineFiles: false }),
          executeBrowser: async () => ({ answerText: 'text', answerMarkdown: 'markdown', tookMs: 1, answerTokens: 1, answerChars: 1 }),
        },
      ),
    ).rejects.toBeInstanceOf(BrowserAutomationError);
    expect(log).not.toHaveBeenCalled();
  });
});
