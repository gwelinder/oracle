import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { ptyAvailable, runOracleTuiWithPty } from '../util/pty.js';

const LIVE = process.env.ORACLE_LIVE_TEST === '1' && Boolean(process.env.OPENAI_API_KEY);
const liveDescribe = LIVE && ptyAvailable ? describe : describe.skip;

liveDescribe('live TUI flow (API multi-model)', () => {
  it(
    'runs ask-oracle via TUI, selects an extra model, and writes a session',
    async () => {
      const { output, exitCode, homeDir } = await runOracleTuiWithPty({
        steps: [
          { match: 'Paste your prompt text', write: 'Live TUI multi-model smoke\n' },
          { match: 'Engine', write: '\r' }, // accept default API
          { match: 'Optional slug', write: '\r' }, // no slug
          { match: 'Model', write: '\r' }, // default first model
          // Down to second model, select with space, submit.
          { match: 'Additional API models', write: '\u001b[B \r' },
          { match: 'Files or globs to attach', write: '\r' }, // none
        ],
        env: {
          ORACLE_HOME_DIR: await fs.mkdtemp(path.join(os.tmpdir(), 'oracle-tui-live-')),
          FORCE_COLOR: '0',
          CI: '',
        },
      });

      const sessionsDir = path.join(process.env.ORACLE_HOME_DIR ?? '', 'sessions');
      const entries = await fs.readdir(sessionsDir);
      expect(entries.length).toBeGreaterThan(0);
      const newest = entries.sort().pop() as string;
      const meta = JSON.parse(await fs.readFile(path.join(sessionsDir, newest, 'meta.json'), 'utf8')) as {
        options?: { models?: string[] };
      };

      await fs.rm(process.env.ORACLE_HOME_DIR ?? '', { recursive: true, force: true }).catch(() => {});
      await fs.rm(homeDir, { recursive: true, force: true }).catch(() => {});

      expect(exitCode).toBe(0);
      expect(meta.options?.models?.length ?? 1).toBeGreaterThan(1);
      expect(output.toLowerCase()).toContain('session');
    },
    180_000,
  );
});
