import type { EngineMode } from './engine.js';
import type { ModelName } from '../oracle.js';

export function shouldDetachSession({
  engine,
  model,
  waitPreference,
  disableDetachEnv,
}: {
  engine: EngineMode;
  model: ModelName;
  waitPreference: boolean;
  disableDetachEnv: boolean;
}): boolean {
  if (disableDetachEnv) return false;
  // Gemini runs must stay inline: forcing detachment can launch the background session runner,
  // which previously led to silent hangs when Gemini picked the browser path. Keep it simple: no detach.
  if (model.startsWith('gemini')) return false;
  // For other models, keep legacy behavior (detach if allowed, then reattach when waitPreference=true).
  return true;
}
