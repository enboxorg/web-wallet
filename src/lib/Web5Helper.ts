import { Protocol, Web5, Record as DwnRecord } from '@enbox/api';
import { DwnProtocolDefinition, Web5Agent } from '@enbox/agent';
import { canonicalize } from '@enbox/crypto';

const Web5Helper = (didUri: string, agent: Web5Agent) => {
  const web5 = new Web5({ agent, connectedDid: didUri });

  return {
    web5,
    didUri,
    getRecord: async (protocol: string, protocolPath: string) => {
      const { status, records } = await (web5 as any)._dwn.records.query({
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
        throw new Error('Web5Helper: Failed to update name');
      }

      const { status: sendStatus } = await updatedRecord.send();
      if (sendStatus.code !== 202) {
        console.info(`Web5Helper: Failed to send ${updatedRecord.protocol} record at ${updatedRecord.protocolPath}: ${sendStatus.detail}`);
      }

      return updatedRecord; 
    },
    deleteRecord: async (record: DwnRecord) => {
      const { status, record: deletedRecord } = await record.delete();
      if (status.code !== 202) {
        throw new Error('Web5Helper: Failed to delete record');
      }

      const { status: sendStatus } = await deletedRecord.send();
      if (sendStatus.code !== 202) {
        console.info(`Web5Helper: Failed to send delete ${deletedRecord.protocol} record at ${deletedRecord.protocolPath}: ${sendStatus.detail}`);
      }

      return deletedRecord;
    },
    createRecord: async (protocol: string, protocolPath: string, dataFormat: string, data: any, parentContextId?: string) => {
      const { status, record } = await (web5 as any)._dwn.records.write({
        data,
        published: true,
        protocol,
        protocolPath,
        dataFormat,
        ...(parentContextId ? { parentContextId } : {}),
      });
  
      if (status.code !== 202) {
        throw new Error(`Web5Helper: Failed to create ${protocol} record at ${protocolPath}: ${status.detail}`);
      }
  
      const { status: sendStatus } = await record!.send();
      if (sendStatus.code !== 202) {
        console.info(`Web5Helper: Failed to send ${protocol} record at ${protocolPath}: ${sendStatus.detail}`);
      }
  
      return record!;
    },
    configureProtocol: async (definition: DwnProtocolDefinition) => {
      const { status, protocols } = await (web5 as any)._dwn.protocols.query({
        filter: {
          protocol: definition.protocol
        }
      });

      if (status.code === 200 && protocols && protocols.length > 0) {
        const existingDefinition = protocols[0].definition;
        if (canonicalize(existingDefinition) !== canonicalize(definition)) {
          throw new Error(`Web5Helper: Protocol ${definition.protocol} already configured with a different definition`);
        }

        return { status, protocol: protocols[0] };
      }

      const { status: configureProfileStatus, protocol } = await (web5 as any)._dwn.protocols.configure({
        definition
      });

      if (configureProfileStatus.code !== 202) {
        throw new Error(`Web5Helper: Failed to configure protocol ${definition.protocol}: ${configureProfileStatus.detail}`);
      }

      const { status: protocolSendStatus } = await protocol!.send(didUri);
      if (protocolSendStatus.code !== 202) {
        console.info(`Web5Helper: Failed to send protocol ${definition.protocol} to ${didUri}`);
      }

      return protocol!;
    },
    listProtocols: async () => {
      const { status, protocols } = await (web5 as any)._dwn.protocols.query({});
      if (status.code !== 200) {
        throw new Error('Web5Helper: Failed to list protocols');
      }

      return protocols.map((protocol: Protocol) => protocol.definition);
    },
    listPermissions: async () => {
      try {
        const permissions = await (web5 as any)._dwn.permissions.queryGrants();
        return permissions;
      } catch (_error) {
        console.log('Web5Helper: Failed to list permissions', _error);
      }
      return [];
    },
    getProtocolDefinition: async (protocol: string) => {
      const { status, protocols } = await (web5 as any)._dwn.protocols.query({
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

export default Web5Helper;