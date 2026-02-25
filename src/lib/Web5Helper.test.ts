import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mock functions (available in vi.mock factories) ──────────

const {
  mockRecordsQuery,
  mockRecordsWrite,
  mockProtocolsQuery,
  mockPermissionsQueryGrants,
  mockConfigure,
} = vi.hoisted(() => ({
  mockRecordsQuery           : vi.fn(),
  mockRecordsWrite           : vi.fn(),
  mockProtocolsQuery         : vi.fn(),
  mockPermissionsQueryGrants : vi.fn(),
  mockConfigure              : vi.fn(),
}));

vi.mock('@enbox/api/advanced', () => {
  function MockDwnApi() {
    return {
      records: {
        query : mockRecordsQuery,
        write : mockRecordsWrite,
      },
      protocols: {
        query: mockProtocolsQuery,
      },
      permissions: {
        queryGrants: mockPermissionsQueryGrants,
      },
    };
  }
  return { DwnApi: MockDwnApi };
});

vi.mock('@enbox/api', () => {
  function MockWeb5() {
    return {
      using: vi.fn().mockReturnValue({
        configure: mockConfigure,
      }),
    };
  }
  return {
    Web5            : MockWeb5,
    defineProtocol  : vi.fn().mockImplementation((def: unknown) => def),
    Protocol        : vi.fn(),
    Record          : vi.fn(),
  };
});

// Import after mocks
import Web5Helper from './Web5Helper';

// ── Test data ────────────────────────────────────────────────────────────

const fakeAgent = {} as any;
const DID_URI = 'did:dht:testuser123';

describe('Web5Helper', () => {
  let helper: ReturnType<typeof Web5Helper>;

  beforeEach(() => {
    vi.clearAllMocks();
    helper = Web5Helper(DID_URI, fakeAgent);
  });

  describe('getRecord', () => {
    it('should return the first record when query succeeds', async () => {
      const fakeRecord = { id: 'rec-1', data: { json: vi.fn() } };
      mockRecordsQuery.mockResolvedValue({
        status  : { code: 200 },
        records : [fakeRecord],
      });

      const result = await helper.getRecord('https://protocol.test', 'path/to/record');

      expect(mockRecordsQuery).toHaveBeenCalledWith({
        filter: {
          protocol     : 'https://protocol.test',
          protocolPath : 'path/to/record',
        },
      });
      expect(result).toBe(fakeRecord);
    });

    it('should return undefined when no records found', async () => {
      mockRecordsQuery.mockResolvedValue({
        status  : { code: 200 },
        records : [],
      });

      const result = await helper.getRecord('https://protocol.test', 'path');
      expect(result).toBeUndefined();
    });

    it('should return undefined on non-200 status', async () => {
      mockRecordsQuery.mockResolvedValue({
        status  : { code: 404 },
        records : null,
      });

      const result = await helper.getRecord('https://protocol.test', 'path');
      expect(result).toBeUndefined();
    });
  });

  describe('updateRecord', () => {
    it('should update a record and send it', async () => {
      const updatedRecord = {
        protocol     : 'https://test',
        protocolPath : 'test',
        send         : vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      const record = {
        update: vi.fn().mockResolvedValue({
          status : { code: 202 },
          record : updatedRecord,
        }),
      };

      const result = await helper.updateRecord(record as any, 'application/json', { name: 'test' });
      expect(record.update).toHaveBeenCalledWith({ data: { name: 'test' }, dataFormat: 'application/json' });
      expect(updatedRecord.send).toHaveBeenCalled();
      expect(result).toBe(updatedRecord);
    });

    it('should throw when update fails', async () => {
      const record = {
        update: vi.fn().mockResolvedValue({
          status : { code: 400, detail: 'Bad Request' },
          record : null,
        }),
      };

      await expect(helper.updateRecord(record as any, 'application/json', {}))
        .rejects.toThrow('Web5Helper: Failed to update name');
    });
  });

  describe('deleteRecord', () => {
    it('should delete a record and send the tombstone', async () => {
      const deletedRecord = {
        protocol     : 'https://test',
        protocolPath : 'test',
        send         : vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      const record = {
        delete: vi.fn().mockResolvedValue({
          status : { code: 202 },
          record : deletedRecord,
        }),
      };

      const result = await helper.deleteRecord(record as any);
      expect(record.delete).toHaveBeenCalled();
      expect(deletedRecord.send).toHaveBeenCalled();
      expect(result).toBe(deletedRecord);
    });

    it('should throw when delete fails', async () => {
      const record = {
        delete: vi.fn().mockResolvedValue({
          status : { code: 400, detail: 'Not allowed' },
          record : null,
        }),
      };

      await expect(helper.deleteRecord(record as any))
        .rejects.toThrow('Web5Helper: Failed to delete record');
    });
  });

  describe('createRecord', () => {
    it('should create a record with all parameters and send it', async () => {
      const createdRecord = {
        send: vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      mockRecordsWrite.mockResolvedValue({
        status : { code: 202 },
        record : createdRecord,
      });

      const result = await helper.createRecord(
        'https://protocol.test',
        'profile',
        'application/json',
        { displayName: 'Test' },
        'parent-ctx-123',
        'https://schema.test',
      );

      expect(mockRecordsWrite).toHaveBeenCalledWith({
        data             : { displayName: 'Test' },
        published        : true,
        protocol         : 'https://protocol.test',
        protocolPath     : 'profile',
        dataFormat       : 'application/json',
        parentContextId  : 'parent-ctx-123',
        schema           : 'https://schema.test',
      });
      expect(createdRecord.send).toHaveBeenCalled();
      expect(result).toBe(createdRecord);
    });

    it('should create a record without optional parentContextId and schema', async () => {
      const createdRecord = {
        send: vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      mockRecordsWrite.mockResolvedValue({
        status : { code: 202 },
        record : createdRecord,
      });

      await helper.createRecord('https://protocol.test', 'profile', 'application/json', {});

      expect(mockRecordsWrite).toHaveBeenCalledWith({
        data         : {},
        published    : true,
        protocol     : 'https://protocol.test',
        protocolPath : 'profile',
        dataFormat   : 'application/json',
      });
    });

    it('should throw when write fails', async () => {
      mockRecordsWrite.mockResolvedValue({
        status : { code: 400, detail: 'Schema validation failed' },
        record : null,
      });

      await expect(
        helper.createRecord('https://protocol.test', 'profile', 'application/json', {})
      ).rejects.toThrow('Web5Helper: Failed to create');
    });
  });

  describe('configureProtocol', () => {
    it('should configure a protocol and send it to remote DWN', async () => {
      const mockProtocol = {
        send: vi.fn().mockResolvedValue({ status: { code: 202 } }),
      };
      mockConfigure.mockResolvedValue({
        status   : { code: 202, detail: 'OK' },
        protocol : mockProtocol,
      });

      const definition = {
        protocol  : 'https://protocol.test/example',
        published : true,
        types     : {},
        structure : {},
      };

      const result = await helper.configureProtocol(definition);

      expect(mockProtocol.send).toHaveBeenCalledWith(DID_URI);
      expect(result).toBe(mockProtocol);
    });

    it('should throw when configure fails', async () => {
      mockConfigure.mockResolvedValue({
        status   : { code: 500, detail: 'Internal error' },
        protocol : null,
      });

      const definition = {
        protocol  : 'https://protocol.test/example',
        published : true,
        types     : {},
        structure : {},
      };

      await expect(helper.configureProtocol(definition))
        .rejects.toThrow('Web5Helper: Failed to configure protocol');
    });
  });

  describe('listProtocols', () => {
    it('should return protocol definitions', async () => {
      const mockDefs = [
        { protocol: 'https://protocol.test/a' },
        { protocol: 'https://protocol.test/b' },
      ];
      mockProtocolsQuery.mockResolvedValue({
        status    : { code: 200 },
        protocols : mockDefs.map(d => ({ definition: d })),
      });

      const result = await helper.listProtocols();
      expect(result).toEqual(mockDefs);
    });

    it('should throw when protocol query fails', async () => {
      mockProtocolsQuery.mockResolvedValue({
        status    : { code: 500 },
        protocols : [],
      });

      await expect(helper.listProtocols()).rejects.toThrow('Web5Helper: Failed to list protocols');
    });
  });

  describe('listPermissions', () => {
    it('should return permission grants', async () => {
      const grants = [{ id: 'grant-1' }, { id: 'grant-2' }];
      mockPermissionsQueryGrants.mockResolvedValue(grants);

      const result = await helper.listPermissions();
      expect(result).toEqual(grants);
    });

    it('should return empty array on error', async () => {
      mockPermissionsQueryGrants.mockRejectedValue(new Error('Failed'));
      const result = await helper.listPermissions();
      expect(result).toEqual([]);
    });
  });

  describe('listRecentRecords', () => {
    it('should query records with default limit of 50', async () => {
      const records = [{ id: 'rec-1' }, { id: 'rec-2' }];
      mockRecordsQuery.mockResolvedValue({
        status  : { code: 200 },
        records,
      });

      const result = await helper.listRecentRecords();
      expect(result).toEqual(records);
      expect(mockRecordsQuery).toHaveBeenCalledWith({
        filter     : { dateCreated: { from: '1970-01-01T00:00:00.000000Z' } },
        dateSort   : 'createdDescending',
        pagination : { limit: 50 },
      });
    });

    it('should accept a custom limit', async () => {
      mockRecordsQuery.mockResolvedValue({
        status  : { code: 200 },
        records : [],
      });

      await helper.listRecentRecords(10);
      expect(mockRecordsQuery).toHaveBeenCalledWith(
        expect.objectContaining({ pagination: { limit: 10 } })
      );
    });

    it('should return empty array on non-200 status', async () => {
      mockRecordsQuery.mockResolvedValue({
        status  : { code: 404 },
        records : null,
      });

      const result = await helper.listRecentRecords();
      expect(result).toEqual([]);
    });
  });

  describe('getProtocolDefinition', () => {
    it('should return a protocol definition by URI', async () => {
      const definition = { protocol: 'https://protocol.test/profile', types: {}, structure: {} };
      mockProtocolsQuery.mockResolvedValue({
        status    : { code: 200 },
        protocols : [{ definition }],
      });

      const result = await helper.getProtocolDefinition('https://protocol.test/profile');
      expect(result).toEqual(definition);
      expect(mockProtocolsQuery).toHaveBeenCalledWith({
        filter: { protocol: 'https://protocol.test/profile' },
      });
    });

    it('should return undefined when protocol not found', async () => {
      mockProtocolsQuery.mockResolvedValue({
        status    : { code: 200 },
        protocols : [],
      });

      const result = await helper.getProtocolDefinition('https://protocol.test/unknown');
      expect(result).toBeUndefined();
    });
  });

  describe('didUri', () => {
    it('should expose the DID URI', () => {
      expect(helper.didUri).toBe(DID_URI);
    });
  });
});
