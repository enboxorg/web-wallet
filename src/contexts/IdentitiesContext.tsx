import React, { createContext, useCallback, useEffect, useRef, useState } from "react";
import { BearerIdentity, DwnProtocolDefinition, getDwnServiceEndpointUrls, PortableIdentity, EnboxAgent } from "@enbox/agent";

import EnboxHelper from "@/lib/EnboxHelper";
import ProfileHelper, { ConnectDefinition, ProfileDefinition } from "@/lib/ProfileProtocol";
import { ConnectProtocol, SocialGraphDefinition } from "@enbox/protocols";
import type { WalletData } from "@enbox/protocols";
import { getStoredTokens, storeTokens, registerDidWithEndpoint } from "@/lib/registration";

import { useAgent } from "./Context";
import { Identity } from "@/lib/types";
import { PermissionGrant, Enbox, Record as DwnRecord, LiveQuery } from "@enbox/api";
import { DwnApi } from "@enbox/api/advanced";

export type ActivityKind = 'record-created' | 'record-updated' | 'protocol-installed' | 'permission-granted';

export interface ActivityItem {
  kind        : ActivityKind;
  title       : string;
  description : string;
  timestamp   : Date;
}

/** Extract the last segment of a protocol URI as a human-friendly name. */
const protocolLabel = (uri: string): string => {
  try {
    const path = new URL(uri).pathname;
    const last = path.split('/').filter(Boolean).pop();
    return last ? last.replace(/-/g, ' ') : uri;
  } catch {
    return uri;
  }
};

/** Build a unified activity feed from real DWN data. */
const buildActivityFeed = (
  records     : DwnRecord[],
  protocols   : DwnProtocolDefinition[],
  permissions : PermissionGrant[],
): ActivityItem[] => {
  const items: ActivityItem[] = [];

  for (const record of records) {
    const isCreate = record.dateCreated === (record as any).messageTimestamp
                  || record.dateCreated === (record as any).timestamp;
    const label    = record.protocol ? protocolLabel(record.protocol) : 'record';
    const path     = record.protocolPath ?? '';

    items.push({
      kind        : isCreate ? 'record-created' : 'record-updated',
      title       : isCreate ? 'Record created' : 'Record updated',
      description : `${label}${path ? ' / ' + path : ''}`,
      timestamp   : new Date(record.dateCreated),
    });
  }

  for (const proto of protocols) {
    items.push({
      kind        : 'protocol-installed',
      title       : 'Protocol installed',
      description : protocolLabel(proto.protocol),
      timestamp   : new Date(), // protocol query doesn't expose install timestamp
    });
  }

  for (const grant of permissions) {
    items.push({
      kind        : 'permission-granted',
      title       : 'Permission granted',
      description : (grant as any).scope?.protocol
        ? protocolLabel((grant as any).scope.protocol)
        : 'general',
      timestamp   : new Date((grant as any).dateGranted ?? (grant as any).messageTimestamp ?? Date.now()),
    });
  }

  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return items;
};

const loadProfileFromBearerIdentity = (agent: EnboxAgent) => async (identity: BearerIdentity): Promise<Identity> => {
  const helper = ProfileHelper(identity.did.uri, agent);
  const social = await helper.getSocial();
  const avatar = await helper.getAvatar();
  const avatarUrl = avatar ? URL.createObjectURL(avatar) : undefined;
  const hero = await helper.getHero();
  const heroUrl = hero ? URL.createObjectURL(hero) : undefined;

  return {
    persona: identity.metadata.name,
    didUri: identity.did.uri,
    profile: {
      social,
      avatar,
      avatarUrl,
      hero,
      heroUrl
    }
  }
}

export interface CreateIdentityParams {
  persona: string;
  displayName: string;
  tagline: string;
  bio: string;
  walletHost: string;
  dwnEndpoints: string[];
  avatar?: Blob;
  hero?: Blob;
}

export interface UpdateIdentityParams extends Omit<CreateIdentityParams, 'walletHost'> {
  didUri: string;
}

interface IdentityContextProps {
  identities: Identity[];
  loadIdentities: () => Promise<void>;
  createIdentity: (params: CreateIdentityParams) => Promise<Identity>;
  updateIdentity: (params: UpdateIdentityParams) => Promise<void>;
  deleteIdentity: (didUri: string) => Promise<void>;
  exportIdentity: (didUri: string) => Promise<PortableIdentity>;
  importIdentity: (walletHost: string, identity: PortableIdentity) => Promise<void>;

  /** Identity specific */
  selectedIdentity: Identity | undefined;
  protocols: DwnProtocolDefinition[];
  permissions: PermissionGrant[];
  activities: ActivityItem[];
  wallets: string[];
  dwnEndpoints: string[];
  selectIdentity: (didUri: string | undefined) => void;
  setWallets: (wallets: string[]) => Promise<void>;
  setDwnEndpoints: (dwnEndpoints: string[]) => Promise<void>;
}

export const IdentitiesContext = createContext<IdentityContextProps | null>(null);

export const IdentitiesProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { agent } = useAgent();
  const [ loadingIdentities, setLoadingIdentities ] = useState<boolean>(false);
  const [ identities, setIdentities ] = useState<Identity[]>([]);
  const [ selectedIdentity, setSelectedIdentity ] = useState<Identity | undefined>();
  const [ protocols, setProtocols ] = useState<DwnProtocolDefinition[]>([]);
  const [ permissions, setPermissions ] = useState<PermissionGrant[]>([]);
  const [ activities, setActivities ] = useState<ActivityItem[]>([]);
  const [ wallets, setWalletsState ] = useState<string[]>([]);
  const [ dwnEndpoints, setDwnEndpointsState ] = useState<string[]>([]);
  const liveQueryRef = useRef<LiveQuery | null>(null);

  const setIdentityWallets = async (didUri: string, walletList: string[]) => {
    if (!agent) return;
    const enbox   = new Enbox({ agent, connectedDid: didUri });
    const connect = enbox.using(ConnectProtocol);

    const { records } = await connect.records.query('wallet');
    const existing = records && records.length > 0 ? records[0] : undefined;

    if (existing) {
      const { status, record: updatedRecord } = await existing.update({
        data: { webWallets: walletList },
      });
      if (status.code === 202) {
        await updatedRecord.send();
      }
    } else {
      const { status, record } = await connect.records.create('wallet', {
        data: { webWallets: walletList },
      });
      if (status.code === 202 && record) {
        await record.send();
      }
    }
  }

  const selectIdentity = (didUri: string | undefined) => {
    const identity = identities.find(identity => identity.didUri === didUri);
    setSelectedIdentity(identity);
  }

  const loadIdentities = useCallback(async () => {
    if (!agent) return;
    if (loadingIdentities) return;
    setLoadingIdentities(true);

    try {
      const identities = await agent.identity.list() || [];
      const parsedIdentities = await Promise.all(identities.map(loadProfileFromBearerIdentity(agent)));
      setIdentities(parsedIdentities);
    } finally {
      setLoadingIdentities(false);
    }
  }, [ agent, loadingIdentities ]);

  const loadSelectedIdentity = useCallback(async () => {
    if (!selectedIdentity || !agent) {
      return;
    };

    // Close any existing LiveQuery subscription
    if (liveQueryRef.current) {
      liveQueryRef.current.close();
      liveQueryRef.current = null;
    }

    const enboxHelper = EnboxHelper(selectedIdentity.didUri, agent);
    const connect     = enboxHelper.enbox.using(ConnectProtocol);
    const dwn         = new DwnApi({ agent, connectedDid: selectedIdentity.didUri });

    const permissionsPromise = enboxHelper.listPermissions();
    const protocolsPromise = enboxHelper.listProtocols();
    const recordsPromise = enboxHelper.listRecentRecords(50);
    const walletsPromise = connect.records.query('wallet').then(({ records }) =>
      records && records.length > 0
        ? records[0].data.json().then((d: any) => (d as WalletData).webWallets)
        : []
    );
    const dwnEndpointsPromise = getDwnServiceEndpointUrls(selectedIdentity.didUri, agent.did);

    const [loadedPermissions, loadedProtocols, loadedRecords] = await Promise.all([
      permissionsPromise, protocolsPromise, recordsPromise,
    ]);

    setPermissions(loadedPermissions);
    setProtocols(loadedProtocols);
    setActivities(buildActivityFeed(loadedRecords, loadedProtocols, loadedPermissions));
    setWalletsState(await walletsPromise);
    setDwnEndpointsState(await dwnEndpointsPromise);

    // Set up a LiveQuery subscription for real-time activity updates
    try {
      const subscribeResult = await dwn.records.subscribe({
        filter: { dateCreated: { from: '1970-01-01T00:00:00.000000Z' } },
      });

      const liveQuery = subscribeResult.liveQuery;
      if (!liveQuery) { throw new Error('LiveQuery not returned'); }

      liveQueryRef.current = liveQuery;

      liveQuery.on('create', (record: DwnRecord) => {
        const label = record.protocol ? protocolLabel(record.protocol) : 'record';
        setActivities(prev => [{
          kind        : 'record-created',
          title       : 'Record created',
          description : `${label}${record.protocolPath ? ' / ' + record.protocolPath : ''}`,
          timestamp   : new Date(record.dateCreated),
        }, ...prev]);
      });

      liveQuery.on('update', (record: DwnRecord) => {
        const label = record.protocol ? protocolLabel(record.protocol) : 'record';
        setActivities(prev => [{
          kind        : 'record-updated',
          title       : 'Record updated',
          description : `${label}${record.protocolPath ? ' / ' + record.protocolPath : ''}`,
          timestamp   : new Date(record.dateCreated),
        }, ...prev]);
      });
    } catch (err) {
      // LiveQuery requires WebSocket support; fall back silently if unavailable
      console.info('LiveQuery subscription not available:', err);
    }

  }, [ selectedIdentity ]);

  const createIdentity = async ({ persona, dwnEndpoints, walletHost, displayName, tagline, bio, avatar, hero }: CreateIdentityParams) => {
    if (!agent) {
      throw new Error("Agent not found");
    }

    const identity = await agent.identity.create({
        store     : true,
        didMethod : 'dht',
        didOptions: {
          services: [
            {
              id              : 'dwn',
              type            : 'DecentralizedWebNode',
              serviceEndpoint : dwnEndpoints,
              enc             : '#enc',
              sig             : '#sig',
            }
          ],
          verificationMethods: [
            {
              algorithm : 'Ed25519',
              id        : 'sig',
              purposes  : ['assertionMethod', 'authentication']
            },
            {
              algorithm : 'X25519',
              id        : 'enc',
              purposes  : ['keyAgreement']
            }
          ]
        },
      metadata: { name: persona }
    });

    await agent.sync.registerIdentity({ did: identity.did.uri, options: { protocols: [
      SocialGraphDefinition.protocol,
      ProfileDefinition.protocol,
      ConnectDefinition.protocol,
    ]} });

    const localStorageIdentities = localStorage.getItem('identities');
    if (localStorageIdentities) {
      const parsedIdentities = JSON.parse(localStorageIdentities) as string[];
      parsedIdentities.push(identity.did.uri);
      localStorage.setItem('identities', JSON.stringify(parsedIdentities));
    } else {
      localStorage.setItem('identities', JSON.stringify([ identity.did.uri ]));
    }

    // Stop the auto-sync interval before triggering a manual pull to avoid
    // "Sync operation is already in progress" race condition.
    await agent.sync.stopSync();
    await agent.sync.sync('pull');

    // Register the new DID with each DWN endpoint. If the endpoint supports
    // provider-auth-v0 and we have a cached token, use it; otherwise fall
    // back to proof-of-work registration.
    let tokens = getStoredTokens();
    for (const endpoint of dwnEndpoints) {
      try {
        const serverInfo = await agent.rpc.getServerInfo(endpoint);
        tokens = await registerDidWithEndpoint(endpoint, identity.did.uri, serverInfo, tokens);
      } catch (err) {
        // Registration may fail for endpoints that don't require it or are
        // unreachable — log and continue so the identity is still usable.
        console.info(`IdentitiesContext: registration with ${endpoint} skipped:`, err);
      }
    }
    storeTokens(tokens);

    /** Configure protocols — SocialGraph must be installed first because
     *  ProfileDefinition declares `uses: { social: '…/social-graph' }`. */
    const enboxHelper = EnboxHelper(identity.did.uri, agent);
    await enboxHelper.configureProtocol(SocialGraphDefinition);
    await enboxHelper.configureProtocol(ProfileDefinition);
    await enboxHelper.configureProtocol(ConnectDefinition);

    /** Set Wallet Information */
    await setIdentityWallets(identity.did.uri, [ walletHost ]);

    /** Set Profile Information */
    const helper = ProfileHelper(identity.did.uri, agent);
    await helper.setSocial({ displayName, tagline, bio, apps: {} });

    if (avatar) {
      await helper.setAvatar(avatar);
    }

    if (hero) {
      await helper.setHero(hero);
    }

    // Restart sync now that protocols are installed on both
    // local and remote DWNs and all profile records have been written.
    agent.sync.startSync({ mode: 'live', interval: '5m' });

    const createdIdentity = {
      persona: persona,
      didUri: identity.did.uri,
      profile: {
        social   : { displayName, tagline, bio, apps: {} },
        avatar,
        avatarUrl: avatar ? URL.createObjectURL(avatar) : undefined,
        hero,
        heroUrl  : hero ? URL.createObjectURL(hero) : undefined,
      }
    }

    setIdentities([ ...identities, createdIdentity ]);
    return createdIdentity;
  }

  /**
   * Ensure the required protocols (SocialGraph, Profile, Connect) are installed
   * for the given identity. This is a safety net for identities that may have
   * been created without protocols (e.g. imported identities, or identities
   * created before protocols were installed eagerly).
   */
  const ensureProtocols = async (didUri: string) => {
    if (!agent) return;
    const enboxHelper = EnboxHelper(didUri, agent);
    const installed = await enboxHelper.listProtocols();
    const installedUris = new Set(installed.map(p => p.protocol));

    if (!installedUris.has(SocialGraphDefinition.protocol)) {
      await enboxHelper.configureProtocol(SocialGraphDefinition);
    }
    if (!installedUris.has(ProfileDefinition.protocol)) {
      await enboxHelper.configureProtocol(ProfileDefinition);
    }
    if (!installedUris.has(ConnectDefinition.protocol)) {
      await enboxHelper.configureProtocol(ConnectDefinition);
    }
  };

  const updateIdentity = async ({ didUri, persona, displayName, tagline, bio, avatar, hero, dwnEndpoints }: UpdateIdentityParams) => {
    if (!agent) {
      throw new Error("Agent not found");
    }

    const identity = identities.find(identity => identity.didUri === didUri);
    if (!identity) {
      throw new Error("Identity not found");
    }

    if (identity.persona !== persona) {
      await agent.identity.setMetadataName({ didUri, name: persona });
    }

    // Ensure protocols are installed before writing profile data.
    await ensureProtocols(didUri);

    const helper = ProfileHelper(didUri, agent);

    if (identity.profile.social?.displayName !== displayName || identity.profile.social?.tagline !== tagline || identity.profile.social?.bio !== bio) {
      await helper.setSocial({ displayName, tagline, bio, apps: {} });
    }

    if (avatar !== identity.profile.avatar) {
      await helper.setAvatar(avatar || null);
    }

    if (hero !== identity.profile.hero) {
      await helper.setHero(hero || null);
    }

    const existingEndpoints = await getDwnServiceEndpointUrls(didUri, agent.did);
    if (existingEndpoints.length !== dwnEndpoints.length || !dwnEndpoints.every(endpoint => existingEndpoints.includes(endpoint))) {
      await agent.identity.setDwnEndpoints({ didUri, endpoints: dwnEndpoints });
    }

    // Revoke old blob URLs before creating new ones to avoid memory leaks
    if (avatar !== identity.profile.avatar && identity.profile.avatarUrl) {
      URL.revokeObjectURL(identity.profile.avatarUrl);
    }
    if (hero !== identity.profile.hero && identity.profile.heroUrl) {
      URL.revokeObjectURL(identity.profile.heroUrl);
    }

    const updatedIdentity = {
      ...identity,
      persona,
      profile: {
        ...identity.profile,
        social: { displayName, tagline, bio, apps: identity.profile.social?.apps ?? {} },
        avatar,
        avatarUrl: avatar ? URL.createObjectURL(avatar) : undefined,
        hero,
        heroUrl: hero ? URL.createObjectURL(hero) : undefined,
      }
    }

    const updatedIdentities = identities.map(identity => {
      if (identity.didUri === didUri) {
        return updatedIdentity;
      }
      return identity;
    });

    setSelectedIdentity(updatedIdentity);
    setIdentities(updatedIdentities);
    setDwnEndpointsState(dwnEndpoints);
  }

  const deleteIdentity = async (didUri: string) => {
    if (!agent) throw new Error("Agent not found");

    const identity = await agent.identity.get({ didUri });
    if (!identity) throw new Error("Identity not found");

    const localStorageIdentities = localStorage.getItem('identities');
    if (localStorageIdentities) {
      const parsedIdentities = JSON.parse(localStorageIdentities) as string[];
      localStorage.setItem('identities', JSON.stringify(parsedIdentities.filter((identity: string) => identity !== didUri)));
    }

    try {
      await agent.sync.unregisterIdentity(didUri);
    } catch(error) {
      console.error('could not unregister identity', error);
    }

    await agent.identity.delete({ didUri });


    try {
      await agent.did.delete({ didUri, tenant: agent.agentDid.uri });
    } catch(error) {
      /** Newer versions of `@enbox/agent` should not throw an error here */
      console.error('could not delete did', error);
    }

    setIdentities(identities.filter(identity => identity.didUri !== didUri));
  }

  const importIdentity = async (walletHost: string, identity: PortableIdentity) => {
    if (!agent)  {
      throw new Error("Agent Not Found");
    }

    const exists = await agent.identity.get({ didUri: identity.portableDid.uri });
    if (exists) {
      throw new Error("Identity already exists");
    }

    const importedIdentity = await agent.identity.import({ portableIdentity: identity });

    await agent.sync.registerIdentity({ did: importedIdentity.did.uri });

    // Register the imported DID with its DWN endpoints (provider auth or PoW).
    const importedEndpoints = await getDwnServiceEndpointUrls(importedIdentity.did.uri, agent.did);
    let tokens = getStoredTokens();
    for (const endpoint of importedEndpoints) {
      try {
        const serverInfo = await agent.rpc.getServerInfo(endpoint);
        tokens = await registerDidWithEndpoint(endpoint, importedIdentity.did.uri, serverInfo, tokens);
      } catch (err) {
        console.info(`IdentitiesContext: registration with ${endpoint} skipped:`, err);
      }
    }
    storeTokens(tokens);

    const localStorageIdentities = localStorage.getItem('identities');
    if (localStorageIdentities) {
      const parsedIdentities = JSON.parse(localStorageIdentities) as string[];
      parsedIdentities.push(importedIdentity.did.uri);
      localStorage.setItem('identities', JSON.stringify(parsedIdentities));
    } else {
      localStorage.setItem('identities', JSON.stringify([ importedIdentity.did.uri ]));
    }

    const enboxHelper = EnboxHelper(importedIdentity.did.uri, agent);
    await enboxHelper.configureProtocol(SocialGraphDefinition);
    await enboxHelper.configureProtocol(ProfileDefinition);
    await enboxHelper.configureProtocol(ConnectDefinition);

    const connect = enboxHelper.enbox.using(ConnectProtocol);
    const { records: walletRecords } = await connect.records.query('wallet');
    const existingWallets = walletRecords && walletRecords.length > 0
      ? ((await walletRecords[0].data.json()) as WalletData).webWallets
      : [] as string[];
    if (existingWallets.length === 0 || !existingWallets.includes(walletHost)) {
      existingWallets.push(walletHost);
      await setIdentityWallets(importedIdentity.did.uri, existingWallets);
    }
  }

  const exportIdentity = async (didUri: string) => {
    const identity = await agent?.identity.get({ didUri });
    if (!identity) {
      throw new Error("Identity not found");
    }

    const portableIdentity = await identity.export();
    return portableIdentity;
  };

  const setWallets = async (walletList: string[]) => {
    if (!agent) return;
    if (!selectedIdentity) return;
    await setIdentityWallets(selectedIdentity.didUri, walletList);
  }

  const setDwnEndpoints = async (endpoints: string[]) => {
    if (!agent) return;
    if (!selectedIdentity) return;
    await agent.identity.setDwnEndpoints({ didUri: selectedIdentity.didUri, endpoints });
    setDwnEndpointsState(endpoints);
  }

  useEffect(() => {
    if (agent) {
      loadIdentities();
    }
  }, [agent]);

  useEffect(() => {
    if (selectedIdentity && agent) {
      loadSelectedIdentity();
    }
  }, [ selectedIdentity, agent ]);

  return (
    <IdentitiesContext.Provider
      value={{
        identities,
        wallets,
        protocols,
        permissions,
        activities,
        dwnEndpoints,
        selectedIdentity,
        loadIdentities,
        setWallets,
        createIdentity,
        updateIdentity,
        deleteIdentity,
        selectIdentity,
        importIdentity,
        exportIdentity,
        setDwnEndpoints
      }}
    >
      {children}
    </IdentitiesContext.Provider>
  );
};
