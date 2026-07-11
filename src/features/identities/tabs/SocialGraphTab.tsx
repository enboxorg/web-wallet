import {
  useMemo,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';
import {
  Ban,
  Check,
  Copy,
  FolderPlus,
  Plus,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  useAddSocialFriend,
  useAddSocialGroupMember,
  useBlockSocialDid,
  useCreateSocialGroup,
  useDeleteSocialGroup,
  useRemoveSocialFriend,
  useRemoveSocialGroupMember,
  useSocialGraph,
  useUnblockSocialDid,
} from '@/enbox/hooks/use-social-graph';
import {
  SOCIAL_FIELD_LIMITS,
  validateSocialDid,
  type SocialGroup,
} from '@/enbox/social-graph';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorAlert } from '@/components/ui/ErrorAlert';
import { Input } from '@/components/ui/Input';
import { Loader } from '@/components/ui/Loader';
import { Textarea } from '@/components/ui/Textarea';
import { copyToClipboard, formatRelativeTime, truncateDid } from '@/lib/utils';

interface SocialGraphTabProps {
  did: string;
}

type AddFriendForm = {
  friendDid: string;
  alias: string;
  note: string;
};

type GroupForm = {
  name: string;
  description: string;
  icon: string;
};

type MemberForm = {
  memberDid: string;
  alias: string;
};

type BlockForm = {
  blockedDid: string;
  reason: string;
};

const emptyFriendForm: AddFriendForm = { friendDid: '', alias: '', note: '' };
const emptyGroupForm: GroupForm = { name: '', description: '', icon: '' };
const emptyMemberForm: MemberForm = { memberDid: '', alias: '' };
const emptyBlockForm: BlockForm = { blockedDid: '', reason: '' };

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function sortByLabel<T extends { did: string; alias?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.alias || a.did).localeCompare(b.alias || b.did),
  );
}

export default function SocialGraphTab({ did }: SocialGraphTabProps) {
  const { data: graph, isLoading, isError, error } = useSocialGraph(did);
  const addFriend = useAddSocialFriend(did);
  const removeFriend = useRemoveSocialFriend(did);
  const createGroup = useCreateSocialGroup(did);
  const deleteGroup = useDeleteSocialGroup(did);
  const addMember = useAddSocialGroupMember(did);
  const removeMember = useRemoveSocialGroupMember(did);
  const blockDid = useBlockSocialDid(did);
  const unblockDid = useUnblockSocialDid(did);

  const [friendDialogOpen, setFriendDialogOpen] = useState(false);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [blockDialogOpen, setBlockDialogOpen] = useState(false);
  const [memberGroup, setMemberGroup] = useState<SocialGroup | null>(null);
  const [friendForm, setFriendForm] = useState<AddFriendForm>(emptyFriendForm);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [memberForm, setMemberForm] = useState<MemberForm>(emptyMemberForm);
  const [blockForm, setBlockForm] = useState<BlockForm>(emptyBlockForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const friends = useMemo(
    () => sortByLabel(graph?.friends ?? []),
    [graph?.friends],
  );
  const groups = graph?.groups ?? [];
  const blocks = graph?.blocks ?? [];

  function closeFriendDialog() {
    setFriendDialogOpen(false);
    setFriendForm(emptyFriendForm);
    setFormError(null);
  }

  function closeGroupDialog() {
    setGroupDialogOpen(false);
    setGroupForm(emptyGroupForm);
    setFormError(null);
  }

  function closeMemberDialog() {
    setMemberGroup(null);
    setMemberForm(emptyMemberForm);
    setFormError(null);
  }

  function closeBlockDialog() {
    setBlockDialogOpen(false);
    setBlockForm(emptyBlockForm);
    setFormError(null);
  }

  async function copyDid(value: string, key: string) {
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopiedId(key);
    setTimeout(() => setCopiedId(null), 1800);
  }

  async function handleAddFriend(e: FormEvent) {
    e.preventDefault();
    const didError = validateSocialDid(friendForm.friendDid, 'Friend DID');
    if (didError) {
      setFormError(didError);
      return;
    }

    try {
      await addFriend.mutateAsync(friendForm);
      toast.success('Friend saved');
      closeFriendDialog();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save friend'));
    }
  }

  async function handleCreateGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      setFormError('Group name is required');
      return;
    }

    try {
      await createGroup.mutateAsync(groupForm);
      toast.success('Group created');
      closeGroupDialog();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to create group'));
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    if (!memberGroup) return;

    const didError = validateSocialDid(memberForm.memberDid, 'Member DID');
    if (didError) {
      setFormError(didError);
      return;
    }

    try {
      await addMember.mutateAsync({
        groupContextId: memberGroup.contextId,
        memberDid: memberForm.memberDid,
        alias: memberForm.alias,
      });
      toast.success('Member saved');
      closeMemberDialog();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save member'));
    }
  }

  async function handleBlockDid(e: FormEvent) {
    e.preventDefault();
    const didError = validateSocialDid(blockForm.blockedDid, 'Blocked DID');
    if (didError) {
      setFormError(didError);
      return;
    }

    try {
      await blockDid.mutateAsync(blockForm);
      toast.success('DID blocked');
      closeBlockDialog();
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to block DID'));
    }
  }

  if (isLoading) {
    return <Loader message="Loading social graph..." />;
  }

  if (isError) {
    return <ErrorAlert message={errorMessage(error, 'Failed to load social graph')} />;
  }

  if (!graph || (friends.length === 0 && groups.length === 0 && blocks.length === 0)) {
    return (
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setFriendDialogOpen(true)}>
            <UserPlus size={14} />
            Add Friend
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setGroupDialogOpen(true)}>
            <FolderPlus size={14} />
            Create Group
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setBlockDialogOpen(true)}>
            <Ban size={14} />
            Block DID
          </Button>
        </div>
        <EmptyState
          icon={<Users />}
          title="No social graph records"
          description="Friends, groups, and blocked people for this profile appear here."
        />
        <SocialDialogs
          friendDialogOpen={friendDialogOpen}
          groupDialogOpen={groupDialogOpen}
          blockDialogOpen={blockDialogOpen}
          memberGroup={memberGroup}
          friendForm={friendForm}
          groupForm={groupForm}
          memberForm={memberForm}
          blockForm={blockForm}
          formError={formError}
          pending={addFriend.isPending || createGroup.isPending || addMember.isPending || blockDid.isPending}
          setFriendForm={setFriendForm}
          setGroupForm={setGroupForm}
          setMemberForm={setMemberForm}
          setBlockForm={setBlockForm}
          closeFriendDialog={closeFriendDialog}
          closeGroupDialog={closeGroupDialog}
          closeMemberDialog={closeMemberDialog}
          closeBlockDialog={closeBlockDialog}
          handleAddFriend={handleAddFriend}
          handleCreateGroup={handleCreateGroup}
          handleAddMember={handleAddMember}
          handleBlockDid={handleBlockDid}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Friends" value={friends.length} />
        <StatTile label="Groups" value={groups.length} />
        <StatTile label="Blocked" value={blocks.length} tone={blocks.length > 0 ? 'danger' : 'default'} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setFriendDialogOpen(true)}>
          <UserPlus size={14} />
          Add Friend
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setGroupDialogOpen(true)}>
          <FolderPlus size={14} />
          Create Group
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setBlockDialogOpen(true)}>
          <Ban size={14} />
          Block DID
        </Button>
      </div>

      <section className="space-y-3" aria-labelledby="friends-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="friends-heading" className="text-sm font-semibold text-text-primary">
            Friends
          </h3>
          <span className="text-xs text-text-tertiary">{friends.length}</span>
        </div>
        {friends.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {friends.map((friend) => (
              <div
                key={friend.id}
                className="rounded-lg border border-border-default bg-surface-1 p-4"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={friend.alias || friend.did} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {friend.alias || truncateDid(friend.did)}
                    </p>
                    <button
                      type="button"
                      onClick={() => copyDid(friend.did, friend.id)}
                      className="mt-0.5 inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-text-tertiary hover:text-text-primary"
                    >
                      <span className="truncate">{truncateDid(friend.did, 7)}</span>
                      {copiedId === friend.id ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0" />
                      )}
                    </button>
                    {friend.note && (
                      <p className="mt-2 line-clamp-3 text-sm text-text-secondary">
                        {friend.note}
                      </p>
                    )}
                    {friend.dateCreated && (
                      <p className="mt-2 text-xs text-text-ghost">
                        Added {formatRelativeTime(friend.dateCreated)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="rounded-md p-2 text-text-tertiary hover:bg-surface-2 hover:text-error"
                      aria-label={`Block ${friend.alias || friend.did}`}
                      onClick={() => {
                        setBlockForm({
                          blockedDid: friend.did,
                          reason: friend.alias ? `Blocked ${friend.alias}` : '',
                        });
                        setBlockDialogOpen(true);
                      }}
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded-md p-2 text-text-tertiary hover:bg-surface-2 hover:text-error"
                      aria-label={`Remove ${friend.alias || friend.did}`}
                      disabled={removeFriend.isPending}
                      onClick={async () => {
                        try {
                          await removeFriend.mutateAsync({ recordId: friend.id });
                          toast.success('Friend removed');
                        } catch (err) {
                          toast.error(errorMessage(err, 'Failed to remove friend'));
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<UserPlus />}
            title="No friends"
            description="Add people to share friend-only content with."
            className="rounded-lg border border-border-default bg-surface-1"
          />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="groups-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="groups-heading" className="text-sm font-semibold text-text-primary">
            Groups
          </h3>
          <span className="text-xs text-text-tertiary">{groups.length}</span>
        </div>
        {groups.length > 0 ? (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.id}
                className="rounded-lg border border-border-default bg-surface-1 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {group.icon && (
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2 text-base">
                          {group.icon}
                        </span>
                      )}
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-text-primary">
                          {group.name}
                        </h4>
                        <p className="text-xs text-text-tertiary">
                          {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                        </p>
                      </div>
                    </div>
                    {group.description && (
                      <p className="mt-2 text-sm text-text-secondary">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setMemberGroup(group)}
                    >
                      <Plus size={14} />
                      Member
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={deleteGroup.isPending}
                      onClick={async () => {
                        try {
                          await deleteGroup.mutateAsync({
                            groupId: group.id,
                            contextId: group.contextId,
                          });
                          toast.success('Group deleted');
                        } catch (err) {
                          toast.error(errorMessage(err, 'Failed to delete group'));
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {group.members.length > 0 && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {sortByLabel(group.members).map((member) => (
                      <div
                        key={member.id}
                        className="flex min-w-0 items-center gap-2 rounded-md bg-surface-2 px-3 py-2"
                      >
                        <Avatar name={member.alias || member.did} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-text-primary">
                            {member.alias || truncateDid(member.did, 6)}
                          </p>
                          <p className="truncate font-mono text-[11px] text-text-tertiary">
                            {truncateDid(member.did, 6)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded p-1.5 text-text-ghost hover:bg-surface-3 hover:text-error"
                          aria-label={`Remove ${member.alias || member.did}`}
                          disabled={removeMember.isPending}
                          onClick={async () => {
                            try {
                              await removeMember.mutateAsync({ memberId: member.id });
                              toast.success('Member removed');
                            } catch (err) {
                              toast.error(errorMessage(err, 'Failed to remove member'));
                            }
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FolderPlus />}
            title="No groups"
            description="Create groups to organize the people you share with."
            className="rounded-lg border border-border-default bg-surface-1"
          />
        )}
      </section>

      <section className="space-y-3" aria-labelledby="blocked-heading">
        <div className="flex items-center justify-between gap-3">
          <h3 id="blocked-heading" className="text-sm font-semibold text-text-primary">
            Blocked DIDs
          </h3>
          <span className="text-xs text-text-tertiary">{blocks.length}</span>
        </div>
        {blocks.length > 0 ? (
          <div className="space-y-2">
            {blocks.map((block) => (
              <div
                key={block.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border-default bg-surface-1 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm text-text-primary">
                    {truncateDid(block.did)}
                  </p>
                  {block.reason && (
                    <p className="mt-1 text-sm text-text-secondary">{block.reason}</p>
                  )}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  loading={unblockDid.isPending}
                  onClick={async () => {
                    try {
                      await unblockDid.mutateAsync({ recordId: block.id });
                      toast.success('DID unblocked');
                    } catch (err) {
                      toast.error(errorMessage(err, 'Failed to unblock DID'));
                    }
                  }}
                >
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Shield />}
            title="No blocked people"
            className="rounded-lg border border-border-default bg-surface-1"
          />
        )}
      </section>

      <SocialDialogs
        friendDialogOpen={friendDialogOpen}
        groupDialogOpen={groupDialogOpen}
        blockDialogOpen={blockDialogOpen}
        memberGroup={memberGroup}
        friendForm={friendForm}
        groupForm={groupForm}
        memberForm={memberForm}
        blockForm={blockForm}
        formError={formError}
        pending={addFriend.isPending || createGroup.isPending || addMember.isPending || blockDid.isPending}
        setFriendForm={setFriendForm}
        setGroupForm={setGroupForm}
        setMemberForm={setMemberForm}
        setBlockForm={setBlockForm}
        closeFriendDialog={closeFriendDialog}
        closeGroupDialog={closeGroupDialog}
        closeMemberDialog={closeMemberDialog}
        closeBlockDialog={closeBlockDialog}
        handleAddFriend={handleAddFriend}
        handleCreateGroup={handleCreateGroup}
        handleAddMember={handleAddMember}
        handleBlockDid={handleBlockDid}
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'danger';
}) {
  return (
    <div className="rounded-lg border border-border-default bg-surface-1 p-3 text-center">
      <p className={tone === 'danger' ? 'text-xl font-semibold text-error' : 'text-xl font-semibold text-text-primary'}>
        {value}
      </p>
      <p className="mt-0.5 text-xs text-text-tertiary">{label}</p>
    </div>
  );
}

function SocialDialogs({
  friendDialogOpen,
  groupDialogOpen,
  blockDialogOpen,
  memberGroup,
  friendForm,
  groupForm,
  memberForm,
  blockForm,
  formError,
  pending,
  setFriendForm,
  setGroupForm,
  setMemberForm,
  setBlockForm,
  closeFriendDialog,
  closeGroupDialog,
  closeMemberDialog,
  closeBlockDialog,
  handleAddFriend,
  handleCreateGroup,
  handleAddMember,
  handleBlockDid,
}: {
  friendDialogOpen: boolean;
  groupDialogOpen: boolean;
  blockDialogOpen: boolean;
  memberGroup: SocialGroup | null;
  friendForm: AddFriendForm;
  groupForm: GroupForm;
  memberForm: MemberForm;
  blockForm: BlockForm;
  formError: string | null;
  pending: boolean;
  setFriendForm: Dispatch<SetStateAction<AddFriendForm>>;
  setGroupForm: Dispatch<SetStateAction<GroupForm>>;
  setMemberForm: Dispatch<SetStateAction<MemberForm>>;
  setBlockForm: Dispatch<SetStateAction<BlockForm>>;
  closeFriendDialog: () => void;
  closeGroupDialog: () => void;
  closeMemberDialog: () => void;
  closeBlockDialog: () => void;
  handleAddFriend: (e: FormEvent) => void;
  handleCreateGroup: (e: FormEvent) => void;
  handleAddMember: (e: FormEvent) => void;
  handleBlockDid: (e: FormEvent) => void;
}) {
  return (
    <>
      <Dialog open={friendDialogOpen} onClose={closeFriendDialog} title="Add Friend">
        <form className="space-y-4" onSubmit={handleAddFriend}>
          {formError && <ErrorAlert message={formError} />}
          <Input
            label="Friend DID"
            value={friendForm.friendDid}
            onChange={(e) => setFriendForm((form) => ({ ...form, friendDid: e.target.value }))}
            placeholder="did:dht:..."
            autoComplete="off"
          />
          <Input
            label="Alias"
            value={friendForm.alias}
            onChange={(e) => setFriendForm((form) => ({ ...form, alias: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.alias}
            autoComplete="off"
          />
          <Textarea
            label="Note"
            value={friendForm.note}
            onChange={(e) => setFriendForm((form) => ({ ...form, note: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.note}
          />
          <DialogActions onCancel={closeFriendDialog} loading={pending} submitLabel="Save Friend" />
        </form>
      </Dialog>

      <Dialog open={groupDialogOpen} onClose={closeGroupDialog} title="Create Group">
        <form className="space-y-4" onSubmit={handleCreateGroup}>
          {formError && <ErrorAlert message={formError} />}
          <Input
            label="Name"
            value={groupForm.name}
            onChange={(e) => setGroupForm((form) => ({ ...form, name: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.groupName}
            autoComplete="off"
          />
          <Input
            label="Icon"
            value={groupForm.icon}
            onChange={(e) => setGroupForm((form) => ({ ...form, icon: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.groupIcon}
            autoComplete="off"
          />
          <Textarea
            label="Description"
            value={groupForm.description}
            onChange={(e) => setGroupForm((form) => ({ ...form, description: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.groupDescription}
          />
          <DialogActions onCancel={closeGroupDialog} loading={pending} submitLabel="Create Group" />
        </form>
      </Dialog>

      <Dialog
        open={memberGroup !== null}
        onClose={closeMemberDialog}
        title={memberGroup ? `Add Member to ${memberGroup.name}` : 'Add Member'}
      >
        <form className="space-y-4" onSubmit={handleAddMember}>
          {formError && <ErrorAlert message={formError} />}
          <Input
            label="Member DID"
            value={memberForm.memberDid}
            onChange={(e) => setMemberForm((form) => ({ ...form, memberDid: e.target.value }))}
            placeholder="did:dht:..."
            autoComplete="off"
          />
          <Input
            label="Alias"
            value={memberForm.alias}
            onChange={(e) => setMemberForm((form) => ({ ...form, alias: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.alias}
            autoComplete="off"
          />
          <DialogActions onCancel={closeMemberDialog} loading={pending} submitLabel="Save Member" />
        </form>
      </Dialog>

      <Dialog open={blockDialogOpen} onClose={closeBlockDialog} title="Block someone">
        <form className="space-y-4" onSubmit={handleBlockDid}>
          {formError && <ErrorAlert message={formError} />}
          <Input
            label="Blocked DID"
            value={blockForm.blockedDid}
            onChange={(e) => setBlockForm((form) => ({ ...form, blockedDid: e.target.value }))}
            placeholder="did:dht:..."
            autoComplete="off"
          />
          <Textarea
            label="Reason"
            value={blockForm.reason}
            onChange={(e) => setBlockForm((form) => ({ ...form, reason: e.target.value }))}
            maxLength={SOCIAL_FIELD_LIMITS.blockReason}
          />
          <DialogActions onCancel={closeBlockDialog} loading={pending} submitLabel="Block someone" danger />
        </form>
      </Dialog>
    </>
  );
}

function DialogActions({
  onCancel,
  loading,
  submitLabel,
  danger = false,
}: {
  onCancel: () => void;
  loading: boolean;
  submitLabel: string;
  danger?: boolean;
}) {
  return (
    <div className="flex justify-end gap-3">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" variant={danger ? 'danger' : 'primary'} size="sm" loading={loading}>
        {submitLabel}
      </Button>
    </div>
  );
}
