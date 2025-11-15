import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../../src/oracle.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/oracle.ts')>('../../src/oracle.ts');
  return {
    ...actual,
    runOracle: vi.fn(),
  };
});

vi.mock('../../src/browser/sessionRunner.ts', () => ({
  runBrowserSessionExecution: vi.fn(),
}));

vi.mock('../../src/sessionManager.ts', async () => {
  const actual = await vi.importActual<typeof import('../../src/sessionManager.ts')>(
    '../../src/sessionManager.ts',
  );
  return {
    ...actual,
    updateSessionMetadata: vi.fn(),
  };
});

import type { SessionMetadata } from '../../src/sessionManager.ts';
import { performSessionRun } from '../../src/cli/sessionRunner.ts';
import { OracleResponseError, OracleTransportError, runOracle } from '../../src/oracle.ts';
import type { OracleResponse, RunOracleResult } from '../../src/oracle.ts';
import { runBrowserSessionExecution } from '../../src/browser/sessionRunner.ts';
import { updateSessionMetadata } from '../../src/sessionManager.ts';

const baseSessionMeta: SessionMetadata = {
  id: 'sess-1',
  createdAt: '2025-01-01T00:00:00Z',
  status: 'pending',
  options: {},
};

const baseRunOptions = {
  prompt: 'Hello',
  model: 'gpt-5-pro' as const,
};

const log = vi.fn();
const write = vi.fn(() => true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('performSessionRun', () => {
  test('completes API sessions and records usage', async () => {
    const liveResult: RunOracleResult = {
      mode: 'live',
      usage: { inputTokens: 10, outputTokens: 20, reasoningTokens: 0, totalTokens: 30 },
      elapsedMs: 1234,
      response: { id: 'resp', usage: {}, output: [] },
    };
    vi.mocked(runOracle).mockResolvedValue(liveResult);

    await performSessionRun({
      sessionMeta: baseSessionMeta,
      runOptions: baseRunOptions,
      mode: 'api',
      cwd: '/tmp',
      log,
      write,
      version: '1.0.0',
    });

    expect(vi.mocked(updateSessionMetadata)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(runOracle)).toHaveBeenCalled();
    const finalUpdate = vi.mocked(updateSessionMetadata).mock.calls.at(-1)?.[1];
    expect(finalUpdate).toMatchObject({
      status: 'completed',
      usage: { totalTokens: 30 },
      response: expect.objectContaining({ responseId: expect.any(String) }),
    });
  });

  test('invokes browser runner when mode is browser', async () => {
    vi.mocked(runBrowserSessionExecution).mockResolvedValue({
      usage: { inputTokens: 100, outputTokens: 50, reasoningTokens: 0, totalTokens: 150 },
      elapsedMs: 2000,
      runtime: { chromePid: 123, chromePort: 9222, userDataDir: '/tmp/profile' },
    });

    await performSessionRun({
      sessionMeta: baseSessionMeta,
      runOptions: baseRunOptions,
      mode: 'browser',
      browserConfig: { chromePath: null },
      cwd: '/tmp',
      log,
      write,
      version: '1.0.0',
    });

    expect(vi.mocked(runBrowserSessionExecution)).toHaveBeenCalled();
    const finalUpdate = vi.mocked(updateSessionMetadata).mock.calls.at(-1)?.[1];
    expect(finalUpdate).toMatchObject({
      status: 'completed',
      browser: expect.objectContaining({ runtime: expect.objectContaining({ chromePid: 123 }) }),
    });
  });

  test('records response metadata when runOracle throws OracleResponseError', async () => {
    const errorResponse: OracleResponse = { id: 'resp-error', output: [], usage: {} };
    vi.mocked(runOracle).mockRejectedValue(new OracleResponseError('boom', errorResponse));

    await expect(
      performSessionRun({
        sessionMeta: baseSessionMeta,
        runOptions: baseRunOptions,
        mode: 'api',
        cwd: '/tmp',
        log,
        write,
        version: '1.0.0',
      }),
    ).rejects.toThrow('boom');

    const finalUpdate = vi.mocked(updateSessionMetadata).mock.calls.at(-1)?.[1];
    expect(finalUpdate).toMatchObject({
      status: 'error',
      response: expect.objectContaining({ responseId: 'resp-error' }),
    });
  });

  test('captures transport failures when OracleTransportError thrown', async () => {
    vi.mocked(runOracle).mockRejectedValue(new OracleTransportError('client-timeout', 'timeout'));

    await expect(
      performSessionRun({
        sessionMeta: baseSessionMeta,
        runOptions: baseRunOptions,
        mode: 'api',
        cwd: '/tmp',
        log,
        write,
        version: '1.0.0',
      }),
    ).rejects.toThrow('timeout');

    const finalUpdate = vi.mocked(updateSessionMetadata).mock.calls.at(-1)?.[1];
    expect(finalUpdate).toMatchObject({
      status: 'error',
      transport: { reason: 'client-timeout' },
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Transport'));
  });
});
