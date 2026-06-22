import { describe, expect, it, vi } from 'vitest';
import { ProtocolsConfigure, Time } from '@enbox/dwn-sdk-js';
import { SocialGraphDefinition } from '@enbox/protocols';

import Ajv from '../ajv-2020-csp';

function toBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

describe('CSP-safe Ajv 2020 shim', () => {
  it('validates protocol tag objects without compiling JavaScript strings', () => {
    const ajv = new Ajv.default();
    const validate = ajv.compile({
      type: 'object',
      properties: {
        did: { type: 'string' },
        listType: { type: 'string', enum: ['todo', 'bookmarks'] },
      },
      required: ['did'],
      additionalProperties: false,
    });

    vi.stubGlobal('Function', function blockedFunction() {
      throw new Error('Function constructor blocked by CSP');
    });

    try {
      expect(validate({ did: 'did:dht:alice', listType: 'todo' })).toBe(true);
      expect(validate({ did: 'did:dht:alice', listType: 'other' })).toBe(false);
      expect(ajv.errorsText(validate.errors, { dataVar: 'tags' })).toContain('tags/listType');
      expect(validate({ listType: 'todo' })).toBe(false);
      expect(ajv.errorsText(validate.errors, { dataVar: 'tags' })).toContain("tags must have required property 'did'");
      expect(validate({ did: 'did:dht:alice', extra: true })).toBe(false);
      expect(ajv.errorsText(validate.errors, { dataVar: 'tags' })).toContain('tags must NOT have additional properties');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('lets SDK protocol definition validation run when unsafe-eval is unavailable', async () => {
    const message = {
      descriptor: {
        interface        : 'Protocols',
        method           : 'Configure',
        messageTimestamp : Time.getCurrentTimestamp(),
        definition       : SocialGraphDefinition,
      },
      authorization: {
        signature: {
          payload    : toBase64Url({ descriptorCid: 'not-the-descriptor-cid' }),
          signatures : [
            {
              protected : toBase64Url({ alg: 'EdDSA', kid: 'did:example:alice#key-1' }),
              signature : 'invalid-signature',
            },
          ],
        },
      },
    };

    vi.stubGlobal('Function', function blockedFunction() {
      throw new Error('Function constructor blocked by CSP');
    });

    try {
      await expect(ProtocolsConfigure.parse(message as any)).rejects.toThrow(/descriptorCid|signature|CID/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
