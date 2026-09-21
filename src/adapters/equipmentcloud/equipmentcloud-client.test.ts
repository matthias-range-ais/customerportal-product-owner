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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('EquipmentCloudClient.listSoftware', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('aggregates the list with each item enriched via its per-item detail call', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware') {
        return Promise.resolve(
          jsonResponse({
            items: [
              { id: 155, name: 'MS Word', category: 'Office' },
              { id: 156, name: 'Windows 10', category: 'Operating Systems' },
            ],
          }),
        );
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/155') {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                id: 155,
                name: 'MS Word',
                category: 'Office',
                description: 'Word processor',
                versions: [{ id: 30, name: '2016' }],
              },
            ],
          }),
        );
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/156') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 156, name: 'Windows 10', category: 'Operating Systems', description: 'OS', versions: [] }],
          }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result).toEqual({
      ok: true,
      items: [
        { id: 155, name: 'MS Word', category: 'Office', description: 'Word processor', versions: [{ id: 30, name: '2016' }] },
        { id: 156, name: 'Windows 10', category: 'Operating Systems', description: 'OS', versions: [] },
      ],
    });
  });

  it('follows controls[0].next across pages, aggregating all items, capped at 50 pages', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 1, name: 'A', category: 'Cat' }],
            controls: [{ next: 'https://example.test/page2' }],
          }),
        );
      }
      if (url === 'https://example.test/page2') {
        return Promise.resolve(jsonResponse({ items: [{ id: 2, name: 'B', category: 'Cat' }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/1') {
        return Promise.resolve(jsonResponse({ items: [{ id: 1, name: 'A', category: 'Cat', description: '', versions: [] }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/2') {
        return Promise.resolve(jsonResponse({ items: [{ id: 2, name: 'B', category: 'Cat', description: '', versions: [] }] }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result.ok).toBe(true);
    expect(result.ok && result.items.map((item) => item.id)).toEqual([1, 2]);
  });

  it('stops pagination on a page with no `items` at all, even when `controls.next` is still present', async () => {
    // Reproduces the real EquipmentCloud API: a page past the last page of real data comes back
    // with only a `controls` block and no `items` key, not an empty `items` array.
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 1, name: 'A', category: 'Cat' }],
            controls: [{ next: 'https://example.test/page2' }],
          }),
        );
      }
      if (url === 'https://example.test/page2') {
        return Promise.resolve(
          jsonResponse({ controls: [{ first: 'x', next: 'https://example.test/page3', prev: 'x' }] }),
        );
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/1') {
        return Promise.resolve(jsonResponse({ items: [{ id: 1, name: 'A', category: 'Cat', description: '', versions: [] }] }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result.ok).toBe(true);
    expect(result.ok && result.items.map((item) => item.id)).toEqual([1]);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContainEqual('https://example.test/page3');
  });

  it('surfaces the raw http-error when the list call is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' });
  });

  it('surfaces a network error distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.test')));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result).toEqual({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND example.test' });
  });

  it('returns the failing detail call\'s error when one of several per-item detail calls fails', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware') {
        return Promise.resolve(
          jsonResponse({
            items: [
              { id: 155, name: 'MS Word', category: 'Office' },
              { id: 156, name: 'Windows 10', category: 'Operating Systems' },
            ],
          }),
        );
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/155') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 155, name: 'MS Word', category: 'Office', description: 'Word processor', versions: [] }],
          }),
        );
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/156') {
        return Promise.resolve(new Response('Not Found', { status: 404 }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 404, body: 'Not Found' });
  });

  it('returns an explicit http-error when a per-item detail call returns an empty items array', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware') {
        return Promise.resolve(jsonResponse({ items: [{ id: 155, name: 'MS Word', category: 'Office' }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/155') {
        // Item was deleted between the list call and this detail call.
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ ok: false, kind: 'http-error', status: 404 });
  });

  it('normalizes a missing/null category to an empty string instead of passing it through', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware') {
        return Promise.resolve(jsonResponse({ items: [{ id: 1, name: 'Uncategorized Tool', category: null }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware/1') {
        return Promise.resolve(
          jsonResponse({ items: [{ id: 1, name: 'Uncategorized Tool', description: '', versions: [] }] }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result).toEqual({
      ok: true,
      items: [{ id: 1, name: 'Uncategorized Tool', category: '', description: '', versions: [] }],
    });
  });

  it('stops following controls[0].next after MAX_PAGES (50) pages instead of looping forever', async () => {
    let pageCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsoftware' || url.startsWith('https://example.test/page')) {
        pageCount++;
        const currentPage = pageCount;
        return Promise.resolve(
          jsonResponse({
            items: [{ id: currentPage, name: `Item ${currentPage}`, category: 'Cat' }],
            // Always returns a next link — would loop forever without the MAX_PAGES cap.
            controls: [{ next: `https://example.test/page${currentPage + 1}` }],
          }),
        );
      }
      // Per-item detail calls — respond with a matching empty-ish detail for any id.
      return Promise.resolve(jsonResponse({ items: [{ id: 1, name: 'Item', category: 'Cat', description: '', versions: [] }] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSoftware();

    expect(result.ok).toBe(true);
    expect(result.ok && result.items).toHaveLength(50);
    expect(pageCount).toBe(50);
  });
});

describe('EquipmentCloudClient.listSets', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps each set state to its label via the releases lookup', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/releases') {
        return Promise.resolve(jsonResponse({ items: [{ id: 155, release_id: 'RELEASED', label: 'Released' }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsets') {
        return Promise.resolve(
          jsonResponse({
            items: [
              { id: 1, name: 'Office Installation', category: 'Office Software', state: 'RELEASED' },
              { id: 2, name: 'Draft Set', category: 'Misc', state: 'UNMAPPED_STATE' },
            ],
          }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSets();

    expect(result).toEqual({
      ok: true,
      items: [
        { id: 1, name: 'Office Installation', category: 'Office Software', state: 'RELEASED', stateLabel: 'Released' },
        { id: 2, name: 'Draft Set', category: 'Misc', state: 'UNMAPPED_STATE', stateLabel: 'UNMAPPED_STATE' },
      ],
    });
  });

  it('surfaces a timeout distinctly when the releases lookup hangs', async () => {
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
    const result = await client.listSets();

    expect(result).toEqual({ ok: false, kind: 'timeout' });
  });

  it('returns the sharedsets failure when releases succeeds but the sharedsets call is rejected', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/releases') {
        return Promise.resolve(jsonResponse({ items: [{ id: 155, release_id: 'RELEASED', label: 'Released' }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsets') {
        return Promise.resolve(new Response('Unauthorized', { status: 401 }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSets();

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' });
  });

  it('normalizes a missing/null category to an empty string instead of passing it through', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/releases') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsets') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 1, name: 'Uncategorized Set', category: null, state: 'DRAFT' }],
          }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listSets();

    expect(result).toEqual({
      ok: true,
      items: [{ id: 1, name: 'Uncategorized Set', category: '', state: 'DRAFT', stateLabel: 'DRAFT' }],
    });
  });
});
