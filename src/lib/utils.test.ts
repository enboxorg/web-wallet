import { describe, it, expect, vi, beforeEach } from 'vitest';
import { truncateDid, cn, toastSuccess, toastError, DEFAULT_DWN_ENDPOINTS, bip39WordList } from './utils';
import { toast } from 'sonner';

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DEFAULT_DWN_ENDPOINTS', () => {
  it('should contain the Fly.io endpoint', () => {
    expect(DEFAULT_DWN_ENDPOINTS).toContain('https://enbox-dwn.fly.dev');
  });

  it('should contain the AWS endpoint', () => {
    expect(DEFAULT_DWN_ENDPOINTS).toContain('https://dev.aws.dwn.enbox.id');
  });

  it('should have exactly two endpoints', () => {
    expect(DEFAULT_DWN_ENDPOINTS).toHaveLength(2);
  });
});

describe('truncateDid', () => {
  it('should return the full DID if it is shorter than maxLength', () => {
    const shortDid = 'did:jwk:abc';
    expect(truncateDid(shortDid, 30)).toBe(shortDid);
  });

  it('should return the full DID if it equals maxLength', () => {
    // Build a DID that is exactly 30 characters
    const did = 'did:dht:abcdefghijklmnopqrst'; // 30 chars
    expect(truncateDid(did, 30)).toBe(did);
  });

  it('should truncate a long DID preserving method and start/end of identifier', () => {
    const longDid = 'did:dht:abcdefghijklmnopqrstuvwxyz123456789abcdefghijklmnopqrstuvwxyz';
    const result = truncateDid(longDid);
    expect(result).toContain('did:dht:');
    expect(result).toContain('....');
    // Should have 12 chars from the start and 12 from the end of the id
    expect(result.startsWith('did:dht:abcdefghijkl')).toBe(true);
    expect(result.endsWith('qrstuvwxyz')).toBe(true);
  });

  it('should respect a custom maxLength', () => {
    const did = 'did:dht:abcdefghijklmnop';
    // With maxLength 10, this should be truncated
    const result = truncateDid(did, 10);
    expect(result).toContain('did:dht:');
    expect(result).toContain('....');
  });

  it('should handle did:jwk method correctly', () => {
    const longDid = 'did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5IiwieCI6InNvbWVsb25na2V5ZGF0YSJ9';
    const result = truncateDid(longDid, 30);
    expect(result).toContain('did:jwk:');
    expect(result).toContain('....');
  });
});

describe('cn', () => {
  it('should merge simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('should handle conditional class names', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
  });

  it('should merge conflicting Tailwind classes keeping the last one', () => {
    // twMerge should resolve conflicts
    expect(cn('p-4', 'p-2')).toBe('p-2');
  });

  it('should handle empty inputs', () => {
    expect(cn()).toBe('');
  });

  it('should handle undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end');
  });
});

describe('toastSuccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call toast.success with message', () => {
    toastSuccess('Created!');
    expect(toast.success).toHaveBeenCalledWith('Created!', { description: undefined });
  });

  it('should call toast.success with message and description', () => {
    toastSuccess('Created!', 'Identity was created successfully');
    expect(toast.success).toHaveBeenCalledWith('Created!', { description: 'Identity was created successfully' });
  });
});

describe('toastError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('should call toast.error with message when no error provided', () => {
    toastError('Something failed');
    expect(toast.error).toHaveBeenCalledWith('Something failed', { description: undefined });
  });

  it('should call toast.error with error message extracted from Error object', () => {
    toastError('Operation failed', new Error('Network timeout'));
    expect(toast.error).toHaveBeenCalledWith('Operation failed', { description: 'Network timeout' });
  });

  it('should fall back to "Unknown error" for non-Error objects', () => {
    toastError('Operation failed', 'string error');
    expect(toast.error).toHaveBeenCalledWith('Operation failed', { description: 'Unknown error' });
  });

  it('should log the error to console', () => {
    toastError('Failed', new Error('test'));
    expect(console.error).toHaveBeenCalledWith('Toast Error >>>', expect.objectContaining({ message: 'Failed' }));
  });
});

describe('bip39WordList', () => {
  it('should contain 2048 words', () => {
    expect(bip39WordList).toHaveLength(2048);
  });

  it('should start with "abandon"', () => {
    expect(bip39WordList[0]).toBe('abandon');
  });

  it('should end with "zoo"', () => {
    expect(bip39WordList[2047]).toBe('zoo');
  });

  it('should contain unique words', () => {
    const uniqueWords = new Set(bip39WordList);
    expect(uniqueWords.size).toBe(bip39WordList.length);
  });

  it('should be sorted alphabetically', () => {
    const sorted = [...bip39WordList].sort();
    expect(bip39WordList).toEqual(sorted);
  });
});
