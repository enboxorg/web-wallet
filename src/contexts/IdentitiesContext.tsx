import React, { createContext, useCallback, useEffect, useState } from "react";
import { BearerIdentity, DwnProtocolDefinition, getDwnServiceEndpointUrls, PortableIdentity, Web5Agent } from "@enbox/agent";

import Web5Helper from "@/lib/Web5Helper";
import ProfileHelper, { ConnectDefinition, ProfileDefinition } from "@/lib/ProfileProtocol";
import { ConnectProtocol, SocialGraphDefinition } from "@enbox/protocols";
import type { WalletData } from "@enbox/protocols";

import { useAgent } from "./Context";
import { Identity } from "@/lib/types";
import { PermissionGrant, Web5, Record as DwnRecord } from "@enbox/api";

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

const loadProfileFromBearerIdentity = (agent: Web5Agent) => async (identity: BearerIdentity): Promise<Identity> => {
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

  const setIdentityWallets = async (didUri: string, walletList: string[]) => {
    if (!agent) return;
    const web5    = new Web5({ agent, connectedDid: didUri });
    const connect = web5.using(ConnectProtocol);

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
      const { status, record } = await connect.records.write('wallet', {
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

    const web5Helper = Web5Helper(selectedIdentity.didUri, agent);
    const connect    = web5Helper.web5.using(ConnectProtocol);

    const permissionsPromise = web5Helper.listPermissions();
    const protocolsPromise = web5Helper.listProtocols();
    const recordsPromise = web5Helper.listRecentRecords(50);
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
              algorithm : 'secp256k1',
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

    /** Configure protocols — SocialGraph must be installed first because
     *  ProfileDefinition declares `uses: { social: '…/social-graph' }`. */
    const web5Helper = Web5Helper(identity.did.uri, agent);
    await web5Helper.configureProtocol(SocialGraphDefinition);
    await web5Helper.configureProtocol(ProfileDefinition);
    await web5Helper.configureProtocol(ConnectDefinition);

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

    // Restart the sync interval now that protocols are installed on both
    // local and remote DWNs and all profile records have been written.
    agent.sync.startSync({ interval: '15s' });

    const craetedIdentity = {
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

    setIdentities([ ...identities, craetedIdentity ]);
    return craetedIdentity;
  }

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

    const localStorageIdentities = localStorage.getItem('identities');
    if (localStorageIdentities) {
      const parsedIdentities = JSON.parse(localStorageIdentities) as string[];
      parsedIdentities.push(importedIdentity.did.uri);
      localStorage.setItem('identities', JSON.stringify(parsedIdentities));
    } else {
      localStorage.setItem('identities', JSON.stringify([ importedIdentity.did.uri ]));
    }

    const web5Helper = Web5Helper(importedIdentity.did.uri, agent);
    await web5Helper.configureProtocol(SocialGraphDefinition);
    await web5Helper.configureProtocol(ProfileDefinition);
    await web5Helper.configureProtocol(ConnectDefinition);

    const connect = web5Helper.web5.using(ConnectProtocol);
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

  /* TODO: Implement in `@enbox/agent` */
  const setDwnEndpoints = async () => {
    throw new Error("Not implemented");
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
