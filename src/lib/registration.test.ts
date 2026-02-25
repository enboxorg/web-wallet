import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getStoredTokens,
  storeTokens,
  clearTokens,
  isTokenExpired,
  registerDidWithEndpoint,
} from './registration';
import type { RegistrationTokenData } from './registration';
import type { ServerInfo } from '@enbox/dwn-clients';
import { DwnRegistrar } from '@enbox/dwn-clients';

// Mock DwnRegistrar
vi.mock('@enbox/dwn-clients', () => ({
  DwnRegistrar: {
    registerTenant: vi.fn().mockResolvedValue(undefined),
    registerTenantWithToken: vi.fn().mockResolvedValue(undefined),
    refreshRegistrationToken: vi.fn().mockResolvedValue({
      registrationToken : 'refreshed-token',
      refreshToken      : 'new-refresh',
      expiresIn         : 3600,
      tokenType         : 'Bearer',
    }),
  },
}));

describe('registration token management', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('getStoredTokens', () => {
    it('should return empty object when no tokens stored', () => {
      expect(getStoredTokens()).toEqual({});
    });

    it('should return parsed tokens from localStorage', () => {
      const tokens: Record<string, RegistrationTokenData> = {
        'https://dwn.example.com': {
          registrationToken : 'tok-123',
          tokenUrl          : 'https://auth.example.com/token',
        },
      };
      localStorage.setItem('enbox:registrationTokens', JSON.stringify(tokens));
      expect(getStoredTokens()).toEqual(tokens);
    });

    it('should return empty object on malformed JSON', () => {
      localStorage.setItem('enbox:registrationTokens', 'not-json');
      expect(getStoredTokens()).toEqual({});
    });
  });

  describe('storeTokens', () => {
    it('should persist tokens to localStorage', () => {
      const tokens: Record<string, RegistrationTokenData> = {
        'https://dwn.example.com': {
          registrationToken : 'tok-abc',
          tokenUrl          : 'https://auth.example.com/token',
          refreshToken      : 'ref-xyz',
          expiresAt         : Date.now() + 3600_000,
        },
      };
      storeTokens(tokens);
      const stored = JSON.parse(localStorage.getItem('enbox:registrationTokens')!);
      expect(stored).toEqual(tokens);
    });

    it('should overwrite previously stored tokens', () => {
      storeTokens({ a: { registrationToken: '1', tokenUrl: 'u' } });
      storeTokens({ b: { registrationToken: '2', tokenUrl: 'u' } });
      const stored = JSON.parse(localStorage.getItem('enbox:registrationTokens')!);
      expect(stored).toEqual({ b: { registrationToken: '2', tokenUrl: 'u' } });
    });
  });

  describe('clearTokens', () => {
    it('should remove tokens from localStorage', () => {
      localStorage.setItem('enbox:registrationTokens', '{"a":"b"}');
      clearTokens();
      expect(localStorage.getItem('enbox:registrationTokens')).toBeNull();
    });

    it('should not throw if no tokens exist', () => {
      expect(() => clearTokens()).not.toThrow();
    });
  });
});

describe('isTokenExpired', () => {
  it('should return false for tokens without expiresAt (never expires)', () => {
    const token: RegistrationTokenData = {
      registrationToken : 'tok',
      tokenUrl          : 'https://example.com/token',
    };
    expect(isTokenExpired(token)).toBe(false);
  });

  it('should return false for tokens that are not yet expired', () => {
    const token: RegistrationTokenData = {
      registrationToken : 'tok',
      tokenUrl          : 'https://example.com/token',
      expiresAt         : Date.now() + 3600_000, // 1 hour from now
    };
    expect(isTokenExpired(token)).toBe(false);
  });

  it('should return true for tokens that have expired', () => {
    const token: RegistrationTokenData = {
      registrationToken : 'tok',
      tokenUrl          : 'https://example.com/token',
      expiresAt         : Date.now() - 1000, // 1 second ago
    };
    expect(isTokenExpired(token)).toBe(true);
  });

  it('should return true for tokens within the 60s expiry buffer', () => {
    const token: RegistrationTokenData = {
      registrationToken : 'tok',
      tokenUrl          : 'https://example.com/token',
      expiresAt         : Date.now() + 30_000, // 30 seconds from now, but within 60s buffer
    };
    expect(isTokenExpired(token)).toBe(true);
  });
});

describe('registerDidWithEndpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should use PoW registration when endpoint does not require provider auth', async () => {
    const serverInfo: ServerInfo = {
      maxFileSize: 100_000_000,
      registrationRequirements: ['proof-of-work-sha256-v0'],
      server: 'dwn-server',
      sdkVersion: '1.0',
      url: 'https://dwn.example.com',
      version: '1.0',
      webSocketSupport: true,
    };

    const result = await registerDidWithEndpoint(
      'https://dwn.example.com',
      'did:dht:abc123',
      serverInfo,
      {},
    );

    expect(vi.mocked(DwnRegistrar.registerTenant)).toHaveBeenCalledWith('https://dwn.example.com', 'did:dht:abc123');
    expect(vi.mocked(DwnRegistrar.registerTenantWithToken)).not.toHaveBeenCalled();
    expect(result).toEqual({});
  });

  it('should use token registration when provider auth is required and token exists', async () => {
    const serverInfo: ServerInfo = {
      maxFileSize: 100_000_000,
      registrationRequirements: ['provider-auth-v0'],
      providerAuth: {
        authorizeUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
      },
      server: 'dwn-server',
      sdkVersion: '1.0',
      url: 'https://dwn.example.com',
      version: '1.0',
      webSocketSupport: true,
    };

    const tokens: Record<string, RegistrationTokenData> = {
      'https://dwn.example.com': {
        registrationToken : 'valid-token',
        tokenUrl          : 'https://auth.example.com/token',
        expiresAt         : Date.now() + 3600_000,
      },
    };

    const result = await registerDidWithEndpoint(
      'https://dwn.example.com',
      'did:dht:abc123',
      serverInfo,
      tokens,
    );

    expect(DwnRegistrar.registerTenantWithToken).toHaveBeenCalledWith(
      'https://dwn.example.com',
      'did:dht:abc123',
      'valid-token',
    );
    expect(DwnRegistrar.registerTenant).not.toHaveBeenCalled();
    expect(result['https://dwn.example.com'].registrationToken).toBe('valid-token');
  });

  it('should refresh expired token before registration', async () => {
    const serverInfo: ServerInfo = {
      maxFileSize: 100_000_000,
      registrationRequirements: ['provider-auth-v0'],
      providerAuth: {
        authorizeUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
        refreshUrl: 'https://auth.example.com/refresh',
      },
      server: 'dwn-server',
      sdkVersion: '1.0',
      url: 'https://dwn.example.com',
      version: '1.0',
      webSocketSupport: true,
    };

    const tokens: Record<string, RegistrationTokenData> = {
      'https://dwn.example.com': {
        registrationToken : 'expired-token',
        refreshToken      : 'refresh-abc',
        tokenUrl          : 'https://auth.example.com/token',
        refreshUrl        : 'https://auth.example.com/refresh',
        expiresAt         : Date.now() - 1000, // expired
      },
    };

    const result = await registerDidWithEndpoint(
      'https://dwn.example.com',
      'did:dht:abc123',
      serverInfo,
      tokens,
    );

    expect(DwnRegistrar.refreshRegistrationToken).toHaveBeenCalledWith(
      'https://auth.example.com/refresh',
      'refresh-abc',
    );
    expect(DwnRegistrar.registerTenantWithToken).toHaveBeenCalledWith(
      'https://dwn.example.com',
      'did:dht:abc123',
      'refreshed-token',
    );
    expect(result['https://dwn.example.com'].registrationToken).toBe('refreshed-token');
    expect(result['https://dwn.example.com'].refreshToken).toBe('new-refresh');
  });

  it('should fall back to PoW when provider auth is required but no token exists', async () => {
    const serverInfo: ServerInfo = {
      maxFileSize: 100_000_000,
      registrationRequirements: ['provider-auth-v0'],
      providerAuth: {
        authorizeUrl: 'https://auth.example.com/authorize',
        tokenUrl: 'https://auth.example.com/token',
      },
      server: 'dwn-server',
      sdkVersion: '1.0',
      url: 'https://dwn.example.com',
      version: '1.0',
      webSocketSupport: true,
    };

    const result = await registerDidWithEndpoint(
      'https://dwn.example.com',
      'did:dht:abc123',
      serverInfo,
      {}, // no tokens
    );

    // Falls back to PoW because there's no token for this endpoint
    expect(DwnRegistrar.registerTenant).toHaveBeenCalledWith('https://dwn.example.com', 'did:dht:abc123');
    expect(result).toEqual({});
  });
});
