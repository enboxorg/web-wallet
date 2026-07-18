import { Effect } from 'effect';
import { Enbox, repository } from '@enbox/api';
import {
  SocialGraphProtocol,
  type BlockData,
  type FriendData,
  type GroupData,
  type MemberData,
} from '@enbox/protocols';

import type { EnboxAgent } from './types';
import { sdkError } from './effect/errors';
import { CurrentAgent, currentAgentLayer } from './effect/services';
import { runEnboxPromise } from './effect/runtime';

const SOCIAL_QUERY_PAGE_SIZE = 100;

export const SOCIAL_FIELD_LIMITS = {
  alias: 80,
  note: 500,
  groupName: 80,
  groupDescription: 500,
  groupIcon: 32,
  blockReason: 500,
} as const;

const DID_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/;

type DwnStatus = { code?: number; detail?: string } | undefined;
type SocialRecord<T> = {
  id: string;
  contextId?: string;
  dateCreated?: string;
  timestamp?: string;
  author?: string;
  recipient?: string;
  tags?: Record<string, unknown>;
  data: { json(): Promise<T> };
  update(params: { data?: Partial<T>; tags?: Record<string, string> }): Promise<{ status?: DwnStatus }>;
  delete(params?: { prune?: boolean }): Promise<{ status?: DwnStatus }>;
};

export interface SocialFriend {
  id: string;
  did: string;
  alias?: string;
  note?: string;
  dateCreated?: string;
  timestamp?: string;
  recipient?: string;
}

export interface SocialBlock {
  id: string;
  did: string;
  reason?: string;
  dateCreated?: string;
  timestamp?: string;
}

export interface SocialGroupMember {
  id: string;
  did: string;
  alias?: string;
  dateCreated?: string;
  timestamp?: string;
}

export interface SocialGroup {
  id: string;
  contextId: string;
  name: string;
  description?: string;
  icon?: string;
  members: SocialGroupMember[];
  dateCreated?: string;
  timestamp?: string;
}

export interface SocialGraph {
  friends: SocialFriend[];
  groups: SocialGroup[];
  blocks: SocialBlock[];
}

export interface AddSocialFriendParams {
  ownerDid: string;
  friendDid: string;
  alias?: string;
  note?: string;
}

export interface RemoveSocialFriendParams {
  ownerDid: string;
  recordId: string;
}

export interface CreateSocialGroupParams {
  ownerDid: string;
  name: string;
  description?: string;
  icon?: string;
}

export interface DeleteSocialGroupParams {
  ownerDid: string;
  groupId: string;
  contextId: string;
}

export interface AddSocialGroupMemberParams {
  ownerDid: string;
  groupContextId: string;
  memberDid: string;
  alias?: string;
}

export interface RemoveSocialGroupMemberParams {
  ownerDid: string;
  memberId: string;
}

export interface BlockSocialDidParams {
  ownerDid: string;
  blockedDid: string;
  reason?: string;
}

export interface UnblockSocialDidParams {
  ownerDid: string;
  recordId: string;
}

function statusText(status: DwnStatus): string {
  return `${status?.code ?? 'unknown'} ${status?.detail ?? 'no status returned'}`;
}

function assertDwnStatusEffect(status: DwnStatus, operation: string) {
  if (!status || status.code === undefined || status.code >= 300) {
    return Effect.fail(new Error(`${operation} failed: ${statusText(status)}`));
  }
  return Effect.void;
}

export function normalizeSocialDid(input: string): string {
  return input.trim();
}

export function validateSocialDid(input: string, label = 'DID'): string | undefined {
  const did = normalizeSocialDid(input);
  if (!did) return `${label} is required`;
  if (did.length > 2048) return `${label} is too long`;
  if (/\s/.test(did)) return `${label} cannot contain spaces`;
  if (!DID_PATTERN.test(did)) return `${label} must be a valid DID`;
  return undefined;
}

function requireSocialDid(input: string, label = 'DID'): string {
  const error = validateSocialDid(input, label);
  if (error) throw new Error(error);
  return normalizeSocialDid(input);
}

function requireRecordId(input: string, label = 'Record ID'): string {
  const value = input.trim();
  if (!value) throw new Error(`${label} is required`);
  if (value.length > 512) throw new Error(`${label} is too long`);
  return value;
}

function optionalText(input: string | undefined, max: number, label: string): string | undefined {
  const value = input?.trim();
  if (!value) return undefined;
  if (value.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return value;
}

function requiredText(input: string, max: number, label: string): string {
  const value = input.trim();
  if (!value) throw new Error(`${label} is required`);
  if (value.length > max) throw new Error(`${label} must be ${max} characters or fewer`);
  return value;
}

function sanitizeAddFriend(params: AddSocialFriendParams) {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const friendDid = requireSocialDid(params.friendDid, 'Friend DID');
  if (ownerDid === friendDid) throw new Error('You cannot add this identity as its own friend');

  return {
    ownerDid,
    friendDid,
    alias: optionalText(params.alias, SOCIAL_FIELD_LIMITS.alias, 'Alias'),
    note: optionalText(params.note, SOCIAL_FIELD_LIMITS.note, 'Note'),
  };
}

function sanitizeCreateGroup(params: CreateSocialGroupParams) {
  return {
    ownerDid: requireSocialDid(params.ownerDid, 'Owner DID'),
    name: requiredText(params.name, SOCIAL_FIELD_LIMITS.groupName, 'Group name'),
    description: optionalText(
      params.description,
      SOCIAL_FIELD_LIMITS.groupDescription,
      'Description',
    ),
    icon: optionalText(params.icon, SOCIAL_FIELD_LIMITS.groupIcon, 'Icon'),
  };
}

function sanitizeAddMember(params: AddSocialGroupMemberParams) {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const memberDid = requireSocialDid(params.memberDid, 'Member DID');
  if (ownerDid === memberDid) throw new Error('You cannot add this identity to its own group');

  return {
    ownerDid,
    memberDid,
    groupContextId: requireRecordId(params.groupContextId, 'Group context ID'),
    alias: optionalText(params.alias, SOCIAL_FIELD_LIMITS.alias, 'Alias'),
  };
}

function sanitizeBlock(params: BlockSocialDidParams) {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const blockedDid = requireSocialDid(params.blockedDid, 'Blocked DID');
  if (ownerDid === blockedDid) throw new Error('You cannot block this identity itself');

  return {
    ownerDid,
    blockedDid,
    reason: optionalText(params.reason, SOCIAL_FIELD_LIMITS.blockReason, 'Reason'),
  };
}

function createEnboxEffect(did: string) {
  return Effect.gen(function* () {
    const agent = yield* CurrentAgent;
    return yield* Effect.try({
      try: () => new Enbox({ agent, connectedDid: did }),
      catch: sdkError('enbox.create'),
    });
  });
}

function createSocialAccessEffect(did: string) {
  return Effect.gen(function* () {
    const enbox = yield* createEnboxEffect(did);
    const typed = enbox.using(SocialGraphProtocol);
    return {
      repo: repository(typed) as any,
      typed: typed as any,
    };
  });
}

function queryAllSocialRecordsEffect<T>(
  typed: any,
  path: 'friend' | 'block' | 'group' | 'group/member',
  request: Record<string, unknown>,
  operation: string,
) {
  return Effect.tryPromise({
    try: async () => {
      const records: SocialRecord<T>[] = [];
      for await (const record of typed.records.queryAll(path, {
        ...request,
        pageSize: SOCIAL_QUERY_PAGE_SIZE,
      })) {
        records.push(record as SocialRecord<T>);
      }
      return records;
    },
    catch: sdkError(operation),
  });
}

function queryByDidEffect<T>(
  typed: any,
  path: 'friend' | 'block',
  did: string,
) {
  return queryAllSocialRecordsEffect<T>(
    typed,
    path,
    { filter: { tags: { did } } },
    `social.${path}.queryByDid`,
  );
}

function readDidFromRecord<T extends { did?: string }>(record: SocialRecord<T>, data: T): string {
  const dataDid = typeof data.did === 'string' ? data.did : undefined;
  const tagDid = typeof record.tags?.did === 'string' ? record.tags.did : undefined;
  return dataDid ?? tagDid ?? '';
}

function normalizeFriendRecordEffect(record: SocialRecord<FriendData>) {
  return Effect.tryPromise({
    try: async (): Promise<SocialFriend | null> => {
      const data = await record.data.json();
      const did = readDidFromRecord(record, data);
      if (!did) return null;

      return {
        id: record.id,
        did,
        alias: data.alias,
        note: data.note,
        dateCreated: record.dateCreated,
        timestamp: record.timestamp,
        recipient: record.recipient,
      };
    },
    catch: sdkError('social.friend.data.json'),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

function normalizeBlockRecordEffect(record: SocialRecord<BlockData>) {
  return Effect.tryPromise({
    try: async (): Promise<SocialBlock | null> => {
      const data = await record.data.json();
      const did = readDidFromRecord(record, data);
      if (!did) return null;

      return {
        id: record.id,
        did,
        reason: data.reason,
        dateCreated: record.dateCreated,
        timestamp: record.timestamp,
      };
    },
    catch: sdkError('social.block.data.json'),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

function normalizeMemberRecordEffect(record: SocialRecord<MemberData>) {
  return Effect.tryPromise({
    try: async (): Promise<SocialGroupMember | null> => {
      const data = await record.data.json();
      const did = readDidFromRecord(record, data);
      if (!did) return null;

      return {
        id: record.id,
        did,
        alias: data.alias,
        dateCreated: record.dateCreated,
        timestamp: record.timestamp,
      };
    },
    catch: sdkError('social.group.member.data.json'),
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

function normalizeGroupRecordEffect(typed: any, record: SocialRecord<GroupData>) {
  return Effect.gen(function* () {
    const data = yield* Effect.tryPromise({
      try: async () => record.data.json(),
      catch: sdkError('social.group.data.json'),
    }).pipe(Effect.catchAll(() => Effect.succeed(null)));

    if (!data?.name) return null;

    const contextId = record.contextId ?? record.id;
    const memberRecords = yield* queryAllSocialRecordsEffect<MemberData>(
      typed,
      'group/member',
      {
        dateSort: 'createdDescending',
        filter  : { parentContextId: contextId },
      },
      'social.group.member.query',
    );

    const maybeMembers = yield* Effect.forEach(
      memberRecords,
      normalizeMemberRecordEffect,
    );

    const group: SocialGroup = {
      id: record.id,
      contextId,
      name: data.name,
      members: maybeMembers.filter((member): member is SocialGroupMember => member !== null),
      dateCreated: record.dateCreated,
      timestamp: record.timestamp,
    };

    if (data.description) group.description = data.description;
    if (data.icon) group.icon = data.icon;

    return group;
  }).pipe(Effect.catchAll(() => Effect.succeed(null)));
}

export async function fetchSocialGraph(
  agent: EnboxAgent,
  did: string,
): Promise<SocialGraph> {
  return runEnboxPromise(
    fetchSocialGraphEffect(did).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export function fetchSocialGraphEffect(did: string) {
  return Effect.gen(function* () {
    const { typed } = yield* createSocialAccessEffect(did);

    const [friendRecords, blockRecords, groupRecords] = yield* Effect.all([
      queryAllSocialRecordsEffect<FriendData>(
        typed,
        'friend',
        { dateSort: 'createdDescending' },
        'social.friend.query',
      ),
      queryAllSocialRecordsEffect<BlockData>(
        typed,
        'block',
        { dateSort: 'createdDescending' },
        'social.block.query',
      ),
      queryAllSocialRecordsEffect<GroupData>(
        typed,
        'group',
        { dateSort: 'createdDescending' },
        'social.group.query',
      ),
    ]);

    const maybeFriends = yield* Effect.forEach(
      friendRecords,
      normalizeFriendRecordEffect,
    );
    const maybeBlocks = yield* Effect.forEach(
      blockRecords,
      normalizeBlockRecordEffect,
    );
    const maybeGroups = yield* Effect.forEach(
      groupRecords,
      (record) => normalizeGroupRecordEffect(typed, record),
    );

    return {
      friends: maybeFriends.filter((friend): friend is SocialFriend => friend !== null),
      blocks: maybeBlocks.filter((block): block is SocialBlock => block !== null),
      groups: maybeGroups.filter((group): group is SocialGroup => group !== null),
    };
  });
}

export async function addSocialFriend(
  agent: EnboxAgent,
  params: AddSocialFriendParams,
): Promise<void> {
  const sanitized = sanitizeAddFriend(params);
  return runEnboxPromise(
    addSocialFriendEffect(sanitized).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

function addSocialFriendEffect(params: ReturnType<typeof sanitizeAddFriend>) {
  return Effect.gen(function* () {
    const { repo, typed } = yield* createSocialAccessEffect(params.ownerDid);
    const existingBlocks = yield* queryByDidEffect<BlockData>(typed, 'block', params.friendDid);
    if (existingBlocks.length > 0) {
      return yield* Effect.fail(
        new Error('Remove this DID from blocked before adding it as a friend'),
      );
    }

    const data = {
      did: params.friendDid,
      ...(params.alias && { alias: params.alias }),
      ...(params.note && { note: params.note }),
    } satisfies FriendData;

    const existingFriends = yield* queryByDidEffect<FriendData>(typed, 'friend', params.friendDid);
    const existing = existingFriends[0];

    if (existing?.recipient === params.friendDid) {
      const { status } = yield* Effect.tryPromise({
        try: async () => existing.update({ data, tags: { did: params.friendDid } }),
        catch: sdkError('social.friend.update'),
      });
      yield* assertDwnStatusEffect(status, 'Updating friend');
      return;
    }

    if (existing) {
      const { status } = yield* Effect.tryPromise({
        try: async () => existing.delete(),
        catch: sdkError('social.friend.delete.legacy'),
      });
      yield* assertDwnStatusEffect(status, 'Replacing friend');
    }

    const { status, record } = yield* Effect.tryPromise({
      try: async () =>
        repo.friend.create({
          data,
          recipient: params.friendDid,
          tags: { did: params.friendDid },
        }),
      catch: sdkError('social.friend.create'),
    });

    yield* assertDwnStatusEffect(status, 'Adding friend');
    if (!record) {
      return yield* Effect.fail(new Error('Adding friend failed: no record returned'));
    }
  });
}

export async function removeSocialFriend(
  agent: EnboxAgent,
  params: RemoveSocialFriendParams,
): Promise<void> {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const recordId = requireRecordId(params.recordId);
  return runEnboxPromise(
    deleteRecordEffect(ownerDid, 'friend', recordId, 'Removing friend').pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export async function createSocialGroup(
  agent: EnboxAgent,
  params: CreateSocialGroupParams,
): Promise<void> {
  const sanitized = sanitizeCreateGroup(params);
  return runEnboxPromise(
    createSocialGroupEffect(sanitized).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

function createSocialGroupEffect(params: ReturnType<typeof sanitizeCreateGroup>) {
  return Effect.gen(function* () {
    const { repo } = yield* createSocialAccessEffect(params.ownerDid);
    const data = {
      name: params.name,
      ...(params.description && { description: params.description }),
      ...(params.icon && { icon: params.icon }),
    } satisfies GroupData;

    const { status, record } = yield* Effect.tryPromise({
      try: async () => repo.group.create({ data }),
      catch: sdkError('social.group.create'),
    });

    yield* assertDwnStatusEffect(status, 'Creating group');
    if (!record) {
      return yield* Effect.fail(new Error('Creating group failed: no record returned'));
    }
  });
}

export async function deleteSocialGroup(
  agent: EnboxAgent,
  params: DeleteSocialGroupParams,
): Promise<void> {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const groupId = requireRecordId(params.groupId, 'Group ID');
  const contextId = requireRecordId(params.contextId, 'Group context ID');
  return runEnboxPromise(
    deleteSocialGroupEffect({ ownerDid, groupId, contextId }).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

function deleteSocialGroupEffect(params: DeleteSocialGroupParams) {
  return Effect.gen(function* () {
    const { typed } = yield* createSocialAccessEffect(params.ownerDid);
    const memberRecords = yield* queryAllSocialRecordsEffect<MemberData>(
      typed,
      'group/member',
      { filter: { parentContextId: params.contextId } },
      'social.group.member.queryForDelete',
    );

    yield* Effect.forEach(
      memberRecords,
      (member) => Effect.gen(function* () {
        const { status } = yield* Effect.tryPromise({
          try: async () => member.delete(),
          catch: sdkError('social.group.member.deleteForGroup'),
        });
        yield* assertDwnStatusEffect(status, 'Deleting group member');
      }),
      { discard: true },
    );

    yield* deleteRecordEffect(params.ownerDid, 'group', params.groupId, 'Deleting group');
  });
}

export async function addSocialGroupMember(
  agent: EnboxAgent,
  params: AddSocialGroupMemberParams,
): Promise<void> {
  const sanitized = sanitizeAddMember(params);
  return runEnboxPromise(
    addSocialGroupMemberEffect(sanitized).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

function addSocialGroupMemberEffect(params: ReturnType<typeof sanitizeAddMember>) {
  return Effect.gen(function* () {
    const { repo, typed } = yield* createSocialAccessEffect(params.ownerDid);
    const existingBlocks = yield* queryByDidEffect<BlockData>(typed, 'block', params.memberDid);
    if (existingBlocks.length > 0) {
      return yield* Effect.fail(
        new Error('Remove this DID from blocked before adding it to a group'),
      );
    }

    const existingMembers = yield* queryAllSocialRecordsEffect<MemberData>(
      typed,
      'group/member',
      {
        filter: {
          parentContextId: params.groupContextId,
          tags           : { did: params.memberDid },
        },
      },
      'social.group.member.queryByDid',
    );

    const data = {
      did: params.memberDid,
      ...(params.alias && { alias: params.alias }),
    } satisfies MemberData;

    const existing = existingMembers[0];
    if (existing) {
      const { status } = yield* Effect.tryPromise({
        try: async () => existing.update({ data, tags: { did: params.memberDid } }),
        catch: sdkError('social.group.member.update'),
      });
      yield* assertDwnStatusEffect(status, 'Updating group member');
      return;
    }

    const { status, record } = yield* Effect.tryPromise({
      try: async () =>
        repo.group.member.create(params.groupContextId, {
          data,
          tags: { did: params.memberDid },
        }),
      catch: sdkError('social.group.member.create'),
    });

    yield* assertDwnStatusEffect(status, 'Adding group member');
    if (!record) {
      return yield* Effect.fail(new Error('Adding group member failed: no record returned'));
    }
  });
}

export async function removeSocialGroupMember(
  agent: EnboxAgent,
  params: RemoveSocialGroupMemberParams,
): Promise<void> {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const memberId = requireRecordId(params.memberId, 'Member ID');
  return runEnboxPromise(
    deleteRecordEffect(ownerDid, 'group.member', memberId, 'Removing group member').pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

export async function blockSocialDid(
  agent: EnboxAgent,
  params: BlockSocialDidParams,
): Promise<void> {
  const sanitized = sanitizeBlock(params);
  return runEnboxPromise(
    blockSocialDidEffect(sanitized).pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

function blockSocialDidEffect(params: ReturnType<typeof sanitizeBlock>) {
  return Effect.gen(function* () {
    const { repo, typed } = yield* createSocialAccessEffect(params.ownerDid);
    const friendRecords = yield* queryByDidEffect<FriendData>(typed, 'friend', params.blockedDid);

    yield* Effect.forEach(
      friendRecords,
      (friend) => Effect.gen(function* () {
        const { status } = yield* Effect.tryPromise({
          try: async () => friend.delete(),
          catch: sdkError('social.friend.deleteForBlock'),
        });
        yield* assertDwnStatusEffect(status, 'Removing friend before block');
      }),
      { discard: true },
    );

    const data = {
      did: params.blockedDid,
      ...(params.reason && { reason: params.reason }),
    } satisfies BlockData;

    const existingBlocks = yield* queryByDidEffect<BlockData>(typed, 'block', params.blockedDid);
    const existing = existingBlocks[0];
    if (existing) {
      const { status } = yield* Effect.tryPromise({
        try: async () => existing.update({ data, tags: { did: params.blockedDid } }),
        catch: sdkError('social.block.update'),
      });
      yield* assertDwnStatusEffect(status, 'Updating block');
      return;
    }

    const { status, record } = yield* Effect.tryPromise({
      try: async () =>
        repo.block.create({
          data,
          tags: { did: params.blockedDid },
        }),
      catch: sdkError('social.block.create'),
    });

    yield* assertDwnStatusEffect(status, 'Blocking DID');
    if (!record) {
      return yield* Effect.fail(new Error('Blocking DID failed: no record returned'));
    }
  });
}

export async function unblockSocialDid(
  agent: EnboxAgent,
  params: UnblockSocialDidParams,
): Promise<void> {
  const ownerDid = requireSocialDid(params.ownerDid, 'Owner DID');
  const recordId = requireRecordId(params.recordId);
  return runEnboxPromise(
    deleteRecordEffect(ownerDid, 'block', recordId, 'Unblocking DID').pipe(
      Effect.provide(currentAgentLayer(agent)),
    ),
  );
}

function deleteRecordEffect(
  ownerDid: string,
  path: 'friend' | 'block' | 'group' | 'group.member',
  recordId: string,
  operation: string,
) {
  return Effect.gen(function* () {
    const { repo } = yield* createSocialAccessEffect(ownerDid);
    const node = path === 'group.member' ? repo.group.member : repo[path];
    const { status } = yield* Effect.tryPromise({
      try: async () => node.delete(recordId),
      catch: sdkError(`social.${path}.delete`),
    });
    yield* assertDwnStatusEffect(status, operation);
  });
}
