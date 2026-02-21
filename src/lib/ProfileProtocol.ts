import type { DwnProtocolDefinition, Web5Agent } from '@enbox/agent';
import type { Record as DwnRecord } from '@enbox/api';

import { ConnectDefinition, ProfileDefinition } from '@enbox/protocols';

import Web5Helper from './Web5Helper';
import { SocialData } from './types';

/** Look up the schema URI for a protocol type, or undefined if none defined. */
function schemaForType(definition: DwnProtocolDefinition, typeName: string): string | undefined {
  return (definition.types as Record<string, { schema?: string }>)?.[typeName]?.schema;
}

/** Re-export definitions from @enbox/protocols for convenience. */
export { ConnectDefinition, ProfileDefinition };

/**
 * Helper for CRUD operations on profile records using the new nested
 * protocol structure from @enbox/protocols.
 *
 * Protocol paths:
 *   profile          -> profile data (displayName, bio, tagline, apps)
 *   profile/avatar   -> avatar image (binary)
 *   profile/hero     -> hero banner image (binary)
 */
const ProfileHelper = (didUri: string, agent: Web5Agent) => {
  const web5Helper = Web5Helper(didUri, agent);
  const protocol = ProfileDefinition.protocol;

  /** The profile record ID, cached after first create/get. */
  let profileRecordId: string | undefined;

  const getProfileRecord = async (): Promise<DwnRecord | undefined> => {
    const record = await web5Helper.getRecord(protocol, 'profile');
    if (record) {
      profileRecordId = record.id;
    }
    return record;
  };

  const setRecordData = async (path: string, dataFormat: string, data: unknown): Promise<DwnRecord> => {
    const record = await web5Helper.getRecord(protocol, path);
    // The leaf segment of the protocolPath is the type name used in the definition.
    const typeName = path.split('/').pop()!;
    const schema = schemaForType(ProfileDefinition, typeName);
    return record
      ? await web5Helper.updateRecord(record, dataFormat, data)
      : await web5Helper.createRecord(protocol, path, dataFormat, data, undefined, schema);
  };

  const setChildRecordData = async (
    parentPath: string,
    childPath: string,
    dataFormat: string,
    data: unknown,
  ): Promise<DwnRecord> => {
    // Ensure the parent profile record exists (avatar/hero are nested under it)
    let parentRecord = await web5Helper.getRecord(protocol, parentPath);
    if (!parentRecord) {
      const parentType = parentPath.split('/').pop()!;
      const parentSchema = schemaForType(ProfileDefinition, parentType);
      // Auto-create a placeholder profile record so children can be created
      parentRecord = await web5Helper.createRecord(protocol, parentPath, 'application/json', {
        displayName : '',
        apps        : {},
      }, undefined, parentSchema);
      profileRecordId = parentRecord.id;
    } else {
      profileRecordId = parentRecord.id;
    }

    const fullPath = `${parentPath}/${childPath}`;
    const childSchema = schemaForType(ProfileDefinition, childPath);
    const existingChild = await web5Helper.getRecord(protocol, fullPath);
    return existingChild
      ? await web5Helper.updateRecord(existingChild, dataFormat, data)
      : await web5Helper.createRecord(protocol, fullPath, dataFormat, data, profileRecordId, childSchema);
  };

  const deleteChildRecord = async (parentPath: string, childPath: string): Promise<DwnRecord | undefined> => {
    const fullPath = `${parentPath}/${childPath}`;
    const record = await web5Helper.getRecord(protocol, fullPath);
    return record ? await web5Helper.deleteRecord(record) : undefined;
  };

  const getSocial = async (): Promise<SocialData | undefined> => {
    const record = await getProfileRecord();
    return record ? record.data.json() : undefined;
  };

  const getAvatar = async (): Promise<Blob | undefined> => {
    const record = await web5Helper.getRecord(protocol, 'profile/avatar');
    return record ? record.data.blob() : undefined;
  };

  const getHero = async (): Promise<Blob | undefined> => {
    const record = await web5Helper.getRecord(protocol, 'profile/hero');
    return record ? record.data.blob() : undefined;
  };

  const setSocial = async (social: SocialData): Promise<DwnRecord> => {
    return setRecordData('profile', 'application/json', social);
  };

  const setAvatar = async (avatar: Blob | null): Promise<DwnRecord | undefined> => {
    return avatar
      ? setChildRecordData('profile', 'avatar', avatar.type, avatar)
      : deleteChildRecord('profile', 'avatar');
  };

  const setHero = async (hero: Blob | null): Promise<DwnRecord | undefined> => {
    return hero
      ? setChildRecordData('profile', 'hero', hero.type, hero)
      : deleteChildRecord('profile', 'hero');
  };

  return {
    getSocial,
    getAvatar,
    getHero,
    setSocial,
    setAvatar,
    setHero,
  };
};

export default ProfileHelper;
