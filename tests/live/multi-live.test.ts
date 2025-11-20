import { describe, expect, it } from 'vitest';
import { runMultiModelApiSession } from '../../src/oracle/multiModelRunner.js';
import { sessionStore } from '../../src/sessionStore.js';
import type { RunOracleOptions } from '../../src/oracle.js';

const live = process.env.ORACLE_LIVE_TEST === '1';
const hasKeys =
  Boolean(process.env.OPENAI_API_KEY) && Boolean(process.env.GEMINI_API_KEY) && Boolean(process.env.ANTHROPIC_API_KEY);

(live ? describe : describe.skip)('Multi-model live smoke (GPT + Gemini + Claude)', () => {
  if (!hasKeys) {
    it.skip('requires OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY', () => {});
    return;
  }

  it(
    'completes all providers',
    async () => {
      const prompt = 'In one concise sentence, explain photosynthesis.';
      const models: RunOracleOptions['models'] = ['gpt-5.1', 'gemini-3-pro', 'claude-4.5-sonnet'];
      await sessionStore.ensureStorage();
      const sessionMeta = await sessionStore.createSession(
        { prompt, model: models[0]!, models, mode: 'api' },
        process.cwd(),
      );
      const summary = await runMultiModelApiSession({
        sessionMeta,
        runOptions: { prompt, model: models[0]!, models, search: false },
        models: models as string[],
        cwd: process.cwd(),
        version: 'live-smoke',
      });
      expect(summary.rejected.length).toBe(0);
      expect(summary.fulfilled.map((r) => r.model)).toEqual(expect.arrayContaining(models as string[]));
      summary.fulfilled.forEach((r) => expect(r.answerText.length).toBeGreaterThan(10));
    },
    180_000,
  );
});
