import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEquipmentCloudClient, EquipmentCloudClient, resolveBaseUrl } from './equipmentcloud-client.js';
import type { CredentialsSource } from './equipmentcloud-port.js';

const CREDENTIALS = { username: 'alice', password: 'secret' };

class StubCredentialsSource implements CredentialsSource {
  constructor(private readonly credentials: { username: string; password: string } | null) {}

  getCredentials() {
    return this.credentials;
  }
}

describe('resolveBaseUrl', () => {
  it('resolves the hardcoded test base URL', () => {
    expect(resolveBaseUrl('test')).toBe('https://eqcloud-test.ad.kontron-ais.com/DEV');
  });

  it('resolves the hardcoded prod base URL', () => {
    expect(resolveBaseUrl('prod')).toBe('https://eqcloud.kontron-ais.com/C1681906');
  });
});

describe('createEquipmentCloudClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null when the environment has no stored credentials', () => {
    const client = createEquipmentCloudClient('test', new StubCredentialsSource(null));

    expect(client).toBeNull();
  });

  it('builds a working client using the environment-appropriate base URL when credentials exist', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = createEquipmentCloudClient('prod', new StubCredentialsSource(CREDENTIALS));
    expect(client).not.toBeNull();

    await client!.checkConnection();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://eqcloud.kontron-ais.com/C1681906/cloudconnect/api/softwarecenter/v1/ping');
  });
});

describe('EquipmentCloudClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports success when the ping responds 2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.checkConnection();

    expect(result).toEqual({ ok: true });
  });

  it('calls GET on the ping endpoint under the given base URL with a Basic Auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test/C123', CREDENTIALS);
    await client.checkConnection();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/C123/cloudconnect/api/softwarecenter/v1/ping');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`);
  });

  it('surfaces the raw status and body text on a non-2xx response (e.g. rejected credentials)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized: invalid credentials', { status: 401 })),
    );

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.checkConnection();

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized: invalid credentials' });
  });

  it('caps an oversized non-2xx response body to 500 characters with a trailing ellipsis', async () => {
    const longBody = 'x'.repeat(2000);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(longBody, { status: 500 })));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.checkConnection();

    expect(result).toEqual({
      ok: false,
      kind: 'http-error',
      status: 500,
      body: `${'x'.repeat(500)}…`,
    });
  });

  it('reports a network error distinctly, carrying the raw underlying message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.test')));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.checkConnection();

    expect(result).toEqual({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND example.test' });
  });

  it('reports a timeout, distinct from a network or http error, when the request exceeds the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const error = new Error('This operation was aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }),
      ),
    );

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS, 10);
    const result = await client.checkConnection();

    expect(result).toEqual({ ok: false, kind: 'timeout' });
  });
});
