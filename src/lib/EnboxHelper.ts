import type { DwnProtocolDefinition, EnboxAgent } from '@enbox/agent';

import { Protocol, Enbox, Record as DwnRecord, defineProtocol } from '@enbox/api';
import type { RecordsQueryRequest } from '@enbox/api/advanced';
import { DwnApi } from '@enbox/api/advanced';

const EnboxHelper = (didUri: string, agent: EnboxAgent) => {
  const enbox = new Enbox({ agent, connectedDid: didUri });
  const dwn   = new DwnApi({ agent, connectedDid: didUri });

  return {
    enbox,
    didUri,
    getRecord: async (protocol: string, protocolPath: string) => {
      const { status, records } = await dwn.records.query({
        filter: {
          protocol,
          protocolPath
        }
      });
  
      if (status.code === 200 && records && records.length > 0) {
        return records[0];
      }
    },
    updateRecord: async (record: DwnRecord, dataFormat: string, data: any) => {
      const { status, record: updatedRecord } = await record.update({ data, dataFormat });
      if (status.code !== 202) {
        throw new Error('EnboxHelper: Failed to update name');
      }

      const { status: sendStatus } = await updatedRecord.send();
      if (sendStatus.code !== 202) {
        console.info(`EnboxHelper: Failed to send ${updatedRecord.protocol} record at ${updatedRecord.protocolPath}: ${sendStatus.detail}`);
      }

      return updatedRecord; 
    },
    deleteRecord: async (record: DwnRecord) => {
      const { status, record: deletedRecord } = await record.delete();
      if (status.code !== 202) {
        throw new Error('EnboxHelper: Failed to delete record');
      }

      const { status: sendStatus } = await deletedRecord.send();
      if (sendStatus.code !== 202) {
        console.info(`EnboxHelper: Failed to send delete ${deletedRecord.protocol} record at ${deletedRecord.protocolPath}: ${sendStatus.detail}`);
      }

      return deletedRecord;
    },
    createRecord: async (protocol: string, protocolPath: string, dataFormat: string, data: any, parentContextId?: string, schema?: string) => {
      const { status, record } = await dwn.records.write({
        data,
        published: true,
        protocol,
        protocolPath,
        dataFormat,
        ...(parentContextId ? { parentContextId } : {}),
        ...(schema ? { schema } : {}),
      });
  
      if (status.code !== 202) {
        throw new Error(`EnboxHelper: Failed to create ${protocol} record at ${protocolPath}: ${status.detail}`);
      }
  
      const { status: sendStatus } = await record!.send();
      if (sendStatus.code !== 202) {
        console.info(`EnboxHelper: Failed to send ${protocol} record at ${protocolPath}: ${sendStatus.detail}`);
      }
  
      return record!;
    },
    /**
     * Installs a protocol using TypedEnbox.configure() for idempotent installation.
     * The definition is wrapped with defineProtocol() to get a TypedProtocol instance.
     */
    configureProtocol: async (definition: DwnProtocolDefinition) => {
      const typed = enbox.using(defineProtocol(definition));
      const { status, protocol } = await typed.configure();
      if (status.code >= 300) {
        throw new Error(`EnboxHelper: Failed to configure protocol ${definition.protocol}: ${status.detail}`);
      }
      console.info(`EnboxHelper: ${definition.protocol}: ${status.detail}`);

      // Install the protocol on the remote DWN so that subsequent record.send()
      // calls don't fail with ProtocolAuthorizationProtocolNotFound.
      if (protocol) {
        const { status: sendStatus } = await protocol.send(didUri);
        if (sendStatus.code >= 300) {
          console.info(`EnboxHelper: Failed to send protocol ${definition.protocol} to remote: ${sendStatus.detail}`);
        }
      }

      return protocol;
    },
    listProtocols: async () => {
      const { status, protocols } = await dwn.protocols.query({});
      if (status.code !== 200) {
        throw new Error('EnboxHelper: Failed to list protocols');
      }

      return protocols.map((protocol: Protocol) => protocol.definition);
    },
    listPermissions: async () => {
      try {
        const permissions = await dwn.permissions.queryGrants();
        return permissions;
      } catch (_error) {
        console.log('EnboxHelper: Failed to list permissions', _error);
      }
      return [];
    },
    listRecentRecords: async (limit: number = 50): Promise<DwnRecord[]> => {
      // The DWN RecordsFilter schema requires at least one property
      // (`minProperties: 1`), so we use a dateCreated range that matches all.
      const { status, records } = await dwn.records.query({
        filter    : { dateCreated: { from: '1970-01-01T00:00:00.000000Z' } },
        dateSort  : 'createdDescending' as RecordsQueryRequest['dateSort'],
        pagination: { limit },
      });

      if (status.code === 200 && records) {
        return records as DwnRecord[];
      }

      return [];
    },
    getProtocolDefinition: async (protocol: string) => {
      const { status, protocols } = await dwn.protocols.query({
        filter: {
          protocol
        }
      });

      if (status.code === 200 && protocols && protocols.length > 0) {
        return protocols[0].definition;
      }
    }
  }
}

export default EnboxHelper;
