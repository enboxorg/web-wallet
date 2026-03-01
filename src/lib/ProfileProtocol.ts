import type { EnboxAgent } from '@enbox/agent';

import { ConnectDefinition, ProfileDefinition, ProfileProtocol } from '@enbox/protocols';
import { repository, Enbox } from '@enbox/api';

import { SocialData } from './types';

/** Re-export definitions from @enbox/protocols for convenience. */
export { ConnectDefinition, ProfileDefinition };

/**
 * Helper for CRUD operations on profile records using the `repository()` pattern.
 *
 * The Profile protocol defines:
 *   profile          -> singleton (displayName, bio, tagline, apps) — `$recordLimit: { max: 1 }`
 *   profile/avatar   -> singleton child image (binary)
 *   profile/hero     -> singleton child image (binary)
 *   profile/link     -> collection of links
 *
 * Because `profile`, `avatar`, and `hero` are all singletons, the repository
 * exposes `set()` / `get()` instead of `create()` / `query()`.
 */
const ProfileHelper = (didUri: string, agent: EnboxAgent) => {
  const enbox = new Enbox({ agent, connectedDid: didUri });
  const repo  = repository(enbox.using(ProfileProtocol));

  const getSocial = async (): Promise<SocialData | undefined> => {
    const record = await repo.profile.get();
    if (!record) { return undefined; }
    const data = await record.data.json();
    // The protocol stores ProfileData; wallet extends it with `apps`.
    return { apps: {}, ...data } as SocialData;
  };

  const getAvatar = async (): Promise<Blob | undefined> => {
    const profileRecord = await repo.profile.get();
    if (!profileRecord?.contextId) { return undefined; }
    const record = await repo.profile.avatar.get(profileRecord.contextId);
    return record ? record.data.blob() : undefined;
  };

  const getHero = async (): Promise<Blob | undefined> => {
    const profileRecord = await repo.profile.get();
    if (!profileRecord?.contextId) { return undefined; }
    const record = await repo.profile.hero.get(profileRecord.contextId);
    return record ? record.data.blob() : undefined;
  };

  const setSocial = async (social: SocialData) => {
    const { status, record } = await repo.profile.set({
      data      : social,
      published : true,
    });
    if (status.code !== 202 || !record) {
      throw new Error(`ProfileHelper: Failed to set profile: ${status.detail}`);
    }
    const { status: sendStatus } = await record.send();
    if (sendStatus.code !== 202) {
      console.info(`ProfileHelper: Failed to send profile: ${sendStatus.detail}`);
    }
    return record;
  };

  const setAvatar = async (avatar: Blob | null) => {
    if (!avatar) {
      return deleteChildImage('avatar');
    }
    return setChildImage('avatar', avatar);
  };

  const setHero = async (hero: Blob | null) => {
    if (!hero) {
      return deleteChildImage('hero');
    }
    return setChildImage('hero', hero);
  };

  /** Write or update a child image record (avatar or hero) via the repository. */
  const setChildImage = async (
    child: 'avatar' | 'hero',
    blob: Blob,
  ) => {
    // Ensure the parent profile singleton exists
    let profileRecord = await repo.profile.get();
    if (!profileRecord) {
      const { status, record } = await repo.profile.set({
        data      : { displayName: '' },
        published : true,
      });
      if (status.code !== 202 || !record) {
        throw new Error(`ProfileHelper: Failed to create placeholder profile: ${status.detail}`);
      }
      await record.send();
      profileRecord = record;
    }

    if (!profileRecord?.contextId) {
      throw new Error('ProfileHelper: Profile record has no contextId');
    }

    const childRepo = repo.profile[child];
    const { status, record } = await childRepo.set(profileRecord.contextId, {
      data : blob,
    });
    if (status.code !== 202 || !record) {
      throw new Error(`ProfileHelper: Failed to set ${child}: ${status.detail}`);
    }
    const { status: sendStatus } = await record.send();
    if (sendStatus.code !== 202) {
      console.info(`ProfileHelper: Failed to send ${child}: ${sendStatus.detail}`);
    }
    return record;
  };

  /** Delete a child image record (avatar or hero). */
  const deleteChildImage = async (child: 'avatar' | 'hero') => {
    const profileRecord = await repo.profile.get();
    if (!profileRecord?.contextId) { return undefined; }

    const childRepo = repo.profile[child];
    const existing = await childRepo.get(profileRecord.contextId);
    if (!existing) { return undefined; }

    const { status } = await existing.delete();
    if (status.code !== 202) {
      throw new Error(`ProfileHelper: Failed to delete ${child}: ${status.detail}`);
    }
    // After delete, the record is a tombstone — send it to propagate the deletion.
    const { status: sendStatus } = await existing.send();
    if (sendStatus.code !== 202) {
      console.info(`ProfileHelper: Failed to send ${child} delete: ${sendStatus.detail}`);
    }
    return existing;
  };

  return {
    enbox,
    repo,
    getSocial,
    getAvatar,
    getHero,
    setSocial,
    setAvatar,
    setHero,
  };
};

export default ProfileHelper;
