import { describe, expect, it } from 'vitest';

import { getConnectErrorMessage } from '../connect-error';

describe('getConnectErrorMessage', () => {
  it.each([null, undefined, 42, {}, { message: 42 }])(
    'uses the fallback for a non-message rejection: %j',
    (error) => {
      expect(getConnectErrorMessage(error, 'Connection failed.')).toBe('Connection failed.');
    },
  );

  it('preserves Error, string, and error-like object messages', () => {
    expect(getConnectErrorMessage(new Error('SDK failed'), 'fallback')).toBe('SDK failed');
    expect(getConnectErrorMessage('Transport failed', 'fallback')).toBe('Transport failed');
    expect(getConnectErrorMessage({ message: 'Browser failed' }, 'fallback')).toBe('Browser failed');
  });

  it('translates low-level permission delivery failures consistently', () => {
    expect(getConnectErrorMessage(
      new Error('Could not send permission grant to any DWN endpoint.'),
      'fallback',
    )).toMatch(/Could not write the approved permission grants/i);
  });
});
