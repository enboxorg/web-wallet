import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions ───────────────────────────────────────────────

const {
  mockProfileGet,
  mockProfileSet,
  mockAvatarGet,
  mockAvatarSet,
  mockHeroGet,
  mockHeroSet,
} = vi.hoisted(() => ({
  mockProfileGet : vi.fn(),
  mockProfileSet : vi.fn(),
  mockAvatarGet  : vi.fn(),
  mockAvatarSet  : vi.fn(),
  mockHeroGet    : vi.fn(),
  mockHeroSet    : vi.fn(),
}));

vi.mock('@enbox/api', () => {
  function MockWeb5() {
    return {
      using: vi.fn().mockReturnValue('typed-web5-mock'),
    };
  }
  return {
    Web5: MockWeb5,
    repository: vi.fn().mockImplementation(() => ({
      profile: {
        get    : mockProfileGet,
        set    : mockProfileSet,
        avatar : { get: mockAvatarGet, set: mockAvatarSet },
        hero   : { get: mockHeroGet, set: mockHeroSet },
      },
    })),
  };
});

vi.mock('@enbox/protocols', () => ({
  ConnectDefinition: { protocol: 'https://protocols/connect' },
  ProfileDefinition: { protocol: 'https://protocols/profile' },
  ProfileProtocol: 'ProfileProtocolMock',
}));

// Import after mocks
import ProfileHelper from './ProfileProtocol';

// ── Test data ────────────────────────────────────────────────────────────

const fakeAgent = {} as any;
const DID_URI = 'did:dht:alice123';

describe('ProfileHelper', () => {
  let helper: ReturnType<typeof ProfileHelper>;

  beforeEach(() => {
    vi.clearAllMocks();
    helper = ProfileHelper(DID_URI, fakeAgent);
  });

  describe('getSocial', () => {
    it('should return social data from the profile singleton', async () => {
      const profileData = { displayName: 'Alice', bio: 'Hello', tagline: 'Dev' };
      mockProfileGet.mockResolvedValue({
        data: { json: vi.fn().mockResolvedValue(profileData) },
      });

      const result = await helper.getSocial();
      expect(result).toEqual({ apps: {}, ...profileData });
      expect(mockProfileGet).toHaveBeenCalled();
    });

    it('should return undefined when no profile exists', async () => {
      mockProfileGet.mockResolvedValue(undefined);

      const result = await helper.getSocial();
      expect(result).toBeUndefined();
    });

    it('should merge apps: {} into profile data that lacks it', async () => {
      mockProfileGet.mockResolvedValue({
        data: { json: vi.fn().mockResolvedValue({ displayName: 'Bob' }) },
      });

      const result = await helper.getSocial();
      expect(result).toHaveProperty('apps');
      expect(result!.apps).toEqual({});
    });
  });

  describe('getAvatar', () => {
    it('should return avatar blob from nested singleton', async () => {
      const avatarBlob = new Blob(['avatar'], { type: 'image/png' });
      mockProfileGet.mockResolvedValue({ contextId: 'ctx-123' });
      mockAvatarGet.mockResolvedValue({
        data: { blob: vi.fn().mockResolvedValue(avatarBlob) },
      });

      const result = await helper.getAvatar();
      expect(result).toBe(avatarBlob);
      expect(mockAvatarGet).toHaveBeenCalledWith('ctx-123');
    });

    it('should return undefined when no profile exists', async () => {
      mockProfileGet.mockResolvedValue(undefined);

      const result = await helper.getAvatar();
      expect(result).toBeUndefined();
      expect(mockAvatarGet).not.toHaveBeenCalled();
    });

    it('should return undefined when profile has no contextId', async () => {
      mockProfileGet.mockResolvedValue({ contextId: undefined });

      const result = await helper.getAvatar();
      expect(result).toBeUndefined();
    });

    it('should return undefined when no avatar record exists', async () => {
      mockProfileGet.mockResolvedValue({ contextId: 'ctx-123' });
      mockAvatarGet.mockResolvedValue(undefined);

      const result = await helper.getAvatar();
      expect(result).toBeUndefined();
    });
  });

  describe('getHero', () => {
    it('should return hero blob from nested singleton', async () => {
      const heroBlob = new Blob(['hero'], { type: 'image/jpeg' });
      mockProfileGet.mockResolvedValue({ contextId: 'ctx-123' });
      mockHeroGet.mockResolvedValue({
        data: { blob: vi.fn().mockResolvedValue(heroBlob) },
      });

      const result = await helper.getHero();
      expect(result).toBe(heroBlob);
      expect(mockHeroGet).toHaveBeenCalledWith('ctx-123');
    });

    it('should return undefined when no profile exists', async () => {
      mockProfileGet.mockResolvedValue(undefined);

      const result = await helper.getHero();
      expect(result).toBeUndefined();
    });
  });

  describe('setSocial', () => {
    it('should set profile social data via repo.profile.set()', async () => {
      const sendMock = vi.fn().mockResolvedValue({ status: { code: 202 } });
      const record = { send: sendMock };
      mockProfileSet.mockResolvedValue({
        status : { code: 202 },
        record,
      });

      const social = { displayName: 'Alice', bio: 'Bio', tagline: 'Tag', apps: {} };
      const result = await helper.setSocial(social);

      expect(mockProfileSet).toHaveBeenCalledWith({
        data      : social,
        published : true,
      });
      expect(sendMock).toHaveBeenCalled();
      expect(result).toBe(record);
    });

    it('should throw when profile set fails', async () => {
      mockProfileSet.mockResolvedValue({
        status : { code: 400, detail: 'Validation error' },
        record : null,
      });

      const social = { displayName: 'Alice', bio: '', tagline: '', apps: {} };
      await expect(helper.setSocial(social))
        .rejects.toThrow('ProfileHelper: Failed to set profile');
    });

    it('should log info but not throw when send fails', async () => {
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const sendMock = vi.fn().mockResolvedValue({ status: { code: 500, detail: 'Remote error' } });
      mockProfileSet.mockResolvedValue({
        status : { code: 202 },
        record : { send: sendMock },
      });

      await helper.setSocial({ displayName: 'Alice', bio: '', tagline: '', apps: {} });
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to send profile'));
      infoSpy.mockRestore();
    });
  });

  describe('setAvatar', () => {
    it('should set avatar via child image repo when blob provided', async () => {
      const sendMock = vi.fn().mockResolvedValue({ status: { code: 202 } });
      const record = { send: sendMock };

      mockProfileGet.mockResolvedValue({ contextId: 'ctx-1' });
      mockAvatarSet.mockResolvedValue({
        status : { code: 202 },
        record,
      });

      const blob = new Blob(['avatar'], { type: 'image/png' });
      const result = await helper.setAvatar(blob);

      expect(mockAvatarSet).toHaveBeenCalledWith('ctx-1', { data: blob });
      expect(sendMock).toHaveBeenCalled();
      expect(result).toBe(record);
    });

    it('should create a placeholder profile if none exists before setting avatar', async () => {
      const profileSend = vi.fn().mockResolvedValue({ status: { code: 202 } });
      const profileRecord = { send: profileSend, contextId: 'new-ctx' };
      const avatarSend = vi.fn().mockResolvedValue({ status: { code: 202 } });
      const avatarRecord = { send: avatarSend };

      mockProfileGet.mockResolvedValue(undefined);
      mockProfileSet.mockResolvedValue({
        status : { code: 202 },
        record : profileRecord,
      });
      mockAvatarSet.mockResolvedValue({
        status : { code: 202 },
        record : avatarRecord,
      });

      const blob = new Blob(['avatar'], { type: 'image/png' });
      const result = await helper.setAvatar(blob);

      expect(mockProfileSet).toHaveBeenCalledWith({
        data      : { displayName: '' },
        published : true,
      });
      expect(profileSend).toHaveBeenCalled();
      expect(mockAvatarSet).toHaveBeenCalledWith('new-ctx', { data: blob });
      expect(result).toBe(avatarRecord);
    });

    it('should delete avatar when null is provided', async () => {
      mockProfileGet.mockResolvedValue({ contextId: 'ctx-1' });
      const existing = {
        delete : vi.fn().mockResolvedValue({ status: { code: 202 } }),
        send   : vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      mockAvatarGet.mockResolvedValue(existing);

      const result = await helper.setAvatar(null);
      expect(existing.delete).toHaveBeenCalled();
      expect(existing.send).toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('should return undefined when deleting avatar that does not exist', async () => {
      mockProfileGet.mockResolvedValue({ contextId: 'ctx-1' });
      mockAvatarGet.mockResolvedValue(undefined);

      const result = await helper.setAvatar(null);
      expect(result).toBeUndefined();
    });
  });

  describe('setHero', () => {
    it('should set hero via child image repo when blob provided', async () => {
      const sendMock = vi.fn().mockResolvedValue({ status: { code: 202 } });
      const record = { send: sendMock };

      mockProfileGet.mockResolvedValue({ contextId: 'ctx-1' });
      mockHeroSet.mockResolvedValue({
        status : { code: 202 },
        record,
      });

      const blob = new Blob(['hero'], { type: 'image/jpeg' });
      const result = await helper.setHero(blob);

      expect(mockHeroSet).toHaveBeenCalledWith('ctx-1', { data: blob });
      expect(result).toBe(record);
    });

    it('should delete hero when null is provided', async () => {
      mockProfileGet.mockResolvedValue({ contextId: 'ctx-1' });
      const existing = {
        delete : vi.fn().mockResolvedValue({ status: { code: 202 } }),
        send   : vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      mockHeroGet.mockResolvedValue(existing);

      const result = await helper.setHero(null);
      expect(existing.delete).toHaveBeenCalled();
      expect(result).toBe(existing);
    });
  });

  describe('exports', () => {
    it('should expose web5 instance', () => {
      expect(helper.web5).toBeDefined();
    });

    it('should expose repo instance', () => {
      expect(helper.repo).toBeDefined();
    });
  });
});
