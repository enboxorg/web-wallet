import { describe, expect, it } from 'vitest';
import { splitAfterSlashes, splitUriHost } from '../uri-display';

describe('splitUriHost', () => {
  it('finds the host without rewriting the URI', () => {
    expect(splitUriHost('https://enbox.id/modules/profile')).toEqual({
      before : 'https://',
      host   : 'enbox.id',
      after  : '/modules/profile',
    });
  });

  it('keeps a port with the host', () => {
    expect(splitUriHost('http://localhost:5200/modules/notes')).toEqual({
      before : 'http://',
      host   : 'localhost:5200',
      after  : '/modules/notes',
    });
  });

  it('handles a URI that is only a host', () => {
    expect(splitUriHost('https://enbox.id')).toEqual({ before: 'https://', host: 'enbox.id', after: '' });
  });

  it('marks the real host, not user-info made to look like one', () => {
    expect(splitUriHost('https://enbox.id@evil.example/modules/profile')).toEqual({
      before : 'https://enbox.id@',
      host   : 'evil.example',
      after  : '/modules/profile',
    });
  });

  it('marks nothing when the written host is not the one a browser would use', () => {
    // A backslash ends the host for a browser, so "enbox.id" here is path text.
    expect(splitUriHost('https://evil.example\\@enbox.id/modules/profile')).toBeUndefined();
    // The default port is dropped by the parser, so the text no longer matches.
    expect(splitUriHost('https://enbox.id:443/modules/profile')).toBeUndefined();
  });

  it('marks nothing for URIs that are not web addresses', () => {
    expect(splitUriHost('urn:example:notes')).toBeUndefined();
    expect(splitUriHost('did:dht:abc123/modules/notes')).toBeUndefined();
    expect(splitUriHost('not a uri')).toBeUndefined();
  });
});

describe('splitAfterSlashes', () => {
  it('cuts after each path segment and keeps the text intact', () => {
    const pieces = splitAfterSlashes('/modules/direct-messages/v2');
    expect(pieces).toEqual(['/', 'modules/', 'direct-messages/', 'v2']);
    expect(pieces.join('')).toBe('/modules/direct-messages/v2');
  });

  it('never cuts inside a run of slashes', () => {
    expect(splitAfterSlashes('https://enbox.id/modules')).toEqual(['https://', 'enbox.id/', 'modules']);
  });

  it('leaves text without path segments in one piece', () => {
    expect(splitAfterSlashes('urn:example:notes')).toEqual(['urn:example:notes']);
    expect(splitAfterSlashes('')).toEqual(['']);
    expect(splitAfterSlashes('/')).toEqual(['/']);
  });
});
