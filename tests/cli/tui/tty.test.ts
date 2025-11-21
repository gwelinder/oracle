import { describe, expect, it } from 'vitest';
import { ptyAvailable, runOracleTuiWithPty } from '../../util/pty.js';
import fs from 'node:fs/promises';

const ptyDescribe = ptyAvailable ? describe : describe.skip;

ptyDescribe('TUI (interactive, PTY)', () => {
  it(
    'renders the menu and exits cleanly when selecting Exit',
    async () => {
      const { output, exitCode, homeDir } = await runOracleTuiWithPty({
        steps: [
          // Move to the Exit row (ask oracle -> ask oracle -> newer/reset -> exit)
          { match: 'Select a session or action', write: '\u001b[B\u001b[B\u001b[B\r' },
        ],
      });
      await fs.rm(homeDir, { recursive: true, force: true }).catch(() => {});

      expect(exitCode).toBe(0);
      expect(output).toContain('🧿 oracle');
      expect(output.toLowerCase()).toContain('closing the book');
    },
    20_000,
  );
});
