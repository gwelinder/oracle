import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { SessionMetadata } from '../../src/sessionManager.ts';
import {
  buildReattachLine,
  formatResponseMetadata,
  formatTransportMetadata,
  formatUserErrorMetadata,
  trimBeforeFirstAnswer,
  attachSession,
} from '../../src/cli/sessionDisplay.ts';
import chalk from 'chalk';

vi.useFakeTimers();

vi.mock('../../src/sessionManager.ts', () => {
  return {
    readSessionMetadata: vi.fn(),
    readSessionLog: vi.fn(),
    wait: vi.fn(),
    listSessionsMetadata: vi.fn(),
    filterSessionsByRange: vi.fn(),
    SESSIONS_DIR: '/tmp/sessions',
  };
});

vi.mock('../../src/cli/markdownRenderer.ts', () => {
  return {
    renderMarkdownAnsi: vi.fn((s: string) => `RENDER:${s}`),
  };
});

const sessionManagerMock = await import('../../src/sessionManager.ts');
const markdownMock = await import('../../src/cli/markdownRenderer.ts');

const originalIsTty = process.stdout.isTTY;
const originalChalkLevel = chalk.level;

beforeEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  chalk.level = 1;
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTty, configurable: true });
  chalk.level = originalChalkLevel;
  vi.restoreAllMocks();
});

describe('formatResponseMetadata', () => {
  test('returns null when metadata missing', () => {
    expect(formatResponseMetadata(undefined)).toBeNull();
  });

  test('joins available metadata parts', () => {
    expect(
      formatResponseMetadata({
        responseId: 'resp-123',
        requestId: 'req-456',
        status: 'completed',
        incompleteReason: undefined,
      }),
    ).toBe('response=resp-123 | request=req-456 | status=completed');
  });
});

describe('formatTransportMetadata', () => {
  test('returns friendly label for known reasons', () => {
    expect(formatTransportMetadata({ reason: 'client-timeout' })).toContain('client timeout');
  });

  test('falls back to null when not provided', () => {
    expect(formatTransportMetadata()).toBeNull();
  });
});

describe('formatUserErrorMetadata', () => {
  test('returns null when not provided', () => {
    expect(formatUserErrorMetadata()).toBeNull();
  });

  test('formats category, message, and details', () => {
    expect(
      formatUserErrorMetadata({ category: 'file-validation', message: 'Too big', details: { path: 'foo.txt' } }),
    ).toBe('file-validation | message=Too big | details={"path":"foo.txt"}');
  });
});

describe('buildReattachLine', () => {
  test('returns message only when session running', () => {
    const now = Date.UTC(2025, 0, 1, 12, 0, 0);
    vi.setSystemTime(now);
    const metadata: SessionMetadata = {
      id: 'session-123',
      createdAt: new Date(now - 30_000).toISOString(),
      status: 'running',
      options: {},
    };
    expect(buildReattachLine(metadata)).toBe('Session session-123 reattached, request started 30s ago.');
  });

  test('returns null for completed sessions', () => {
    const metadata: SessionMetadata = {
      id: 'done',
      createdAt: new Date().toISOString(),
      status: 'completed',
      options: {},
    };
    expect(buildReattachLine(metadata)).toBeNull();
  });
});

describe('trimBeforeFirstAnswer', () => {
  test('returns log starting at first Answer marker', () => {
    const input = 'intro\nnoise\nAnswer:\nactual content\n';
    expect(trimBeforeFirstAnswer(input)).toBe('Answer:\nactual content\n');
  });

  test('returns original text when marker missing', () => {
    const input = 'no answer yet';
    expect(trimBeforeFirstAnswer(input)).toBe(input);
  });
});

describe('attachSession rendering', () => {
  const baseMeta: SessionMetadata = {
    id: 'sess',
    createdAt: new Date().toISOString(),
    status: 'completed',
    options: {},
  };

  beforeEach(() => {
    (markdownMock.renderMarkdownAnsi as any)?.mockClear?.();
  });

  test('renders markdown when requested and rich tty', async () => {
    sessionManagerMock.readSessionMetadata.mockResolvedValue(baseMeta);
    sessionManagerMock.readSessionLog.mockResolvedValue('Answer:\nhello *world*');
    const writeSpy = vi.spyOn(process.stdout, 'write');

    await attachSession('sess', { renderMarkdown: true });

    expect(markdownMock.renderMarkdownAnsi).toHaveBeenCalledWith('Answer:\nhello *world*');
    expect(writeSpy).toHaveBeenCalledWith('RENDER:Answer:\nhello *world*');
  });

  test('skips render when too large', async () => {
    sessionManagerMock.readSessionMetadata.mockResolvedValue(baseMeta);
    sessionManagerMock.readSessionLog.mockResolvedValue('A'.repeat(210_000));
    const writeSpy = vi.spyOn(process.stdout, 'write');

    await attachSession('sess', { renderMarkdown: true });

    expect(markdownMock.renderMarkdownAnsi).not.toHaveBeenCalled();
    expect(writeSpy).toHaveBeenCalled(); // raw write
  });
});
