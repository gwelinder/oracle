import { describe, expect, it } from 'vitest';
import { testHelpers, resolveNotificationSettings } from '../src/cli/notifier.js';

describe('resolveNotificationSettings', () => {
  it('defaults to enabled when not in CI or SSH', () => {
    const result = resolveNotificationSettings({ cliNotify: undefined, cliNotifySound: undefined, env: {} });
    expect(result.enabled).toBe(true);
    expect(result.sound).toBe(false);
  });

  it('disables by default in CI', () => {
    // biome-ignore lint/style/useNamingConvention: environment variable name
    const result = resolveNotificationSettings({ cliNotify: undefined, cliNotifySound: undefined, env: { CI: '1' } });
    expect(result.enabled).toBe(false);
  });

  it('honors explicit CLI override', () => {
    // biome-ignore lint/style/useNamingConvention: environment variable name
    const result = resolveNotificationSettings({ cliNotify: true, cliNotifySound: true, env: { CI: '1' } });
    expect(result.enabled).toBe(true);
    expect(result.sound).toBe(true);
  });

  it('parses env toggles', () => {
    // biome-ignore lint/style/useNamingConvention: environment variable name
    const result = resolveNotificationSettings({ cliNotify: undefined, cliNotifySound: undefined, env: { ORACLE_NOTIFY: 'off' } });
    expect(result.enabled).toBe(false);
  });

  it('sanitizes and truncates previews to 200 characters', () => {
    const longPreview = `\`code\` ${'a'.repeat(300)}`;
    const sanitized = testHelpers.sanitizePreview(longPreview);
    expect(sanitized).toBeDefined();
    expect(sanitized?.length).toBe(200);
    expect(sanitized?.includes('code')).toBe(true);
    expect(sanitized?.endsWith('…')).toBe(true);
  });
});
