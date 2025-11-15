import { describe, expect, test } from 'vitest';
import {
  BrowserAutomationError,
  FileValidationError,
  PromptValidationError,
  OracleUserError,
  asOracleUserError,
} from '../../src/oracle/errors.ts';

describe('oracle user errors', () => {
  test('FileValidationError exposes category/details', () => {
    const error = new FileValidationError('too large', { path: 'foo.txt', size: 2_000_000 });
    expect(error).toBeInstanceOf(OracleUserError);
    expect(error.category).toBe('file-validation');
    expect(error.details).toEqual({ path: 'foo.txt', size: 2_000_000 });
    expect(asOracleUserError(error)).toBe(error);
  });

  test('BrowserAutomationError exposes category/details', () => {
    const error = new BrowserAutomationError('selector missing', { selector: '#prompt' });
    expect(error.category).toBe('browser-automation');
    expect(error.details).toEqual({ selector: '#prompt' });
  });

  test('PromptValidationError exposes category/details', () => {
    const error = new PromptValidationError('prompt empty');
    expect(error.category).toBe('prompt-validation');
    expect(error.details).toBeUndefined();
  });

  test('asOracleUserError returns null for non-user errors', () => {
    expect(asOracleUserError(new Error('boom'))).toBeNull();
  });
});
