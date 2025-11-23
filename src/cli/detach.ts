import type { EngineMode } from './engine.js';
import type { ModelName } from '../oracle.js';
import { isProModel } from '../oracle/modelResolver.js';

export function shouldDetachSession({
  // Params kept for future policy tweaks; currently only model/disableDetachEnv matter.
  engine,
  model,
  waitPreference: _waitPreference,
  disableDetachEnv,
}: {
  engine: EngineMode;
  model: ModelName;
  waitPreference: boolean;
  disableDetachEnv: boolean;
}): boolean {
  if (disableDetachEnv) return false;
  // Only Pro-tier API runs should start detached by default; browser runs stay inline so failures surface.
  if (isProModel(model) && engine === 'api') return true;
  return false;
}
