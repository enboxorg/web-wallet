import type { Web5Agent } from '@enbox/agent';

import { ConnectDefinition, ProfileDefinition, ProfileProtocol } from '@enbox/protocols';
import { Web5 } from '@enbox/api';

import { SocialData } from './types';

/** Re-export definitions from @enbox/protocols for convenience. */
export { ConnectDefinition, ProfileDefinition };

/**
 * Helper for CRUD operations on profile records using `TypedWeb5`.
 *
 * Protocol paths:
 *   profile          -> profile data (displayName, bio, tagline, apps)
 *   profile/avatar   -> avatar image (binary)
 *   profile/hero     -> hero banner image (binary)
 */
const ProfileHelper = (didUri: string, agent: Web5Agent) => {
  const web5    = new Web5({ agent, connectedDid: didUri });
  const profile = web5.using(ProfileProtocol);

  /** The profile record ID, cached after first create/get. */
  let profileRecordId: string | undefined;

  const getProfileRecord = async () => {
    const { records } = await profile.records.query('profile');
    if (records && records.length > 0) {
      profileRecordId = records[0].id;
      return records[0];
    }
    return undefined;
  };

  const getSocial = async (): Promise<SocialData | undefined> => {
    const record = await getProfileRecord();
    return record ? await record.data.json() as SocialData : undefined;
  };

  const getAvatar = async (): Promise<Blob | undefined> => {
    const { records } = await profile.records.query('profile/avatar');
    return records && records.length > 0 ? records[0].data.blob() : undefined;
  };

  const getHero = async (): Promise<Blob | undefined> => {
    const { records } = await profile.records.query('profile/hero');
    return records && records.length > 0 ? records[0].data.blob() : undefined;
  };

  const setSocial = async (social: SocialData) => {
    const existing = await getProfileRecord();
    if (existing) {
      const { status, record: updatedRecord } = await existing.update({
        data      : social,
        published : true,
      });
      if (status.code !== 202) {
        throw new Error(`ProfileHelper: Failed to update profile: ${status.detail}`);
      }
      const { status: sendStatus } = await updatedRecord.send();
      if (sendStatus.code !== 202) {
        console.info(`ProfileHelper: Failed to send profile update: ${sendStatus.detail}`);
      }
      return updatedRecord;
    }

    const { status, record } = await profile.records.create('profile', {
      data      : social,
      published : true,
    });
    if (status.code !== 202 || !record) {
      throw new Error(`ProfileHelper: Failed to create profile: ${status.detail}`);
    }
    const { status: sendStatus } = await record.send();
    if (sendStatus.code !== 202) {
      console.info(`ProfileHelper: Failed to send profile: ${sendStatus.detail}`);
    }
    profileRecordId = record.id;
    return record;
  };

  const setAvatar = async (avatar: Blob | null) => {
    return avatar
      ? setChildImage('avatar', avatar)
      : deleteChild('avatar');
  };

  const setHero = async (hero: Blob | null) => {
    return hero
      ? setChildImage('hero', hero)
      : deleteChild('hero');
  };

  /** Create or update a child image record (avatar or hero). */
  const setChildImage = async (
    child: 'avatar' | 'hero',
    blob: Blob,
  ) => {
    // Ensure the parent profile record exists
    if (!profileRecordId) {
      const existing = await getProfileRecord();
      if (!existing) {
        // Auto-create a placeholder profile record
        const { status, record } = await profile.records.create('profile', {
          data      : { displayName: '' } as SocialData,
          published : true,
        });
        if (status.code !== 202 || !record) {
          throw new Error(`ProfileHelper: Failed to create placeholder profile: ${status.detail}`);
        }
        await record.send();
        profileRecordId = record.id;
      }
    }

    const path = `profile/${child}` as const;
    const { records } = await profile.records.query(path);
    const existing = records && records.length > 0 ? records[0] : undefined;

    if (existing) {
      const { status, record: updatedRecord } = await existing.update({
        data       : blob,
        dataFormat : blob.type,
      });
      if (status.code !== 202) {
        throw new Error(`ProfileHelper: Failed to update ${child}: ${status.detail}`);
      }
      const { status: sendStatus } = await updatedRecord.send();
      if (sendStatus.code !== 202) {
        console.info(`ProfileHelper: Failed to send ${child} update: ${sendStatus.detail}`);
      }
      return updatedRecord;
    }

    const { status, record } = await profile.records.create(path, {
      data            : blob,
      published       : true,
      dataFormat      : blob.type as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
      parentContextId : profileRecordId,
    });
    if (status.code !== 202 || !record) {
      throw new Error(`ProfileHelper: Failed to create ${child}: ${status.detail}`);
    }
    const { status: sendStatus } = await record.send();
    if (sendStatus.code !== 202) {
      console.info(`ProfileHelper: Failed to send ${child}: ${sendStatus.detail}`);
    }
    return record;
  };

  /** Delete a child record (avatar or hero). */
  const deleteChild = async (child: 'avatar' | 'hero') => {
    const path = `profile/${child}` as const;
    const { records } = await profile.records.query(path);
    if (!records || records.length === 0) {
      return undefined;
    }
    const { status, record: deletedRecord } = await records[0].delete();
    if (status.code !== 202) {
      throw new Error(`ProfileHelper: Failed to delete ${child}: ${status.detail}`);
    }
    const { status: sendStatus } = await deletedRecord.send();
    if (sendStatus.code !== 202) {
      console.info(`ProfileHelper: Failed to send ${child} delete: ${sendStatus.detail}`);
    }
    return deletedRecord;
  };

  return {
    web5,
    getSocial,
    getAvatar,
    getHero,
    setSocial,
    setAvatar,
    setHero,
  };
};

export default ProfileHelper;
