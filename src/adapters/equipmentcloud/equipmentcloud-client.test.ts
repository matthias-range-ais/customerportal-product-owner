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
              {
                id: 1,
                name: 'Office Installation',
                category: 'Office Software',
                state: 'RELEASED',
                updated_on: '2026-03-01T10:00:00Z',
              },
              {
                id: 2,
                name: 'Draft Set',
                category: 'Misc',
                state: 'UNMAPPED_STATE',
                updated_on: '2026-02-15T08:30:00Z',
              },
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
        {
          id: 1,
          name: 'Office Installation',
          category: 'Office Software',
          state: 'RELEASED',
          stateLabel: 'Released',
          updatedOn: '2026-03-01T10:00:00Z',
        },
        {
          id: 2,
          name: 'Draft Set',
          category: 'Misc',
          state: 'UNMAPPED_STATE',
          stateLabel: 'UNMAPPED_STATE',
          updatedOn: '2026-02-15T08:30:00Z',
        },
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
            items: [{ id: 1, name: 'Uncategorized Set', category: null, state: 'DRAFT', updated_on: '2026-01-05T00:00:00Z' }],
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
        {
          id: 1,
          name: 'Uncategorized Set',
          category: '',
          state: 'DRAFT',
          stateLabel: 'DRAFT',
          updatedOn: '2026-01-05T00:00:00Z',
        },
      ],
    });
  });

  it('normalizes a missing/null updated_on to an empty string instead of passing it through', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/releases') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/sharedsets') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 1, name: 'Undated Set', category: 'Misc', state: 'DRAFT', updated_on: null }],
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
        {
          id: 1,
          name: 'Undated Set',
          category: 'Misc',
          state: 'DRAFT',
          stateLabel: 'DRAFT',
          updatedOn: '',
        },
      ],
    });
  });
});

describe('EquipmentCloudClient.listEquipment', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches things in a single call (no pagination) and maps equipment_type to equipmentType', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/equipmenthub/v1/things') {
        return Promise.resolve(
          jsonResponse({
            items: [
              { id: 'HPC0815', name: 'Router 1', equipment_type: 'Router' },
              { id: 'HPC0816', name: 'Router 2', equipment_type: 'Router' },
            ],
          }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listEquipment();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      items: [
        { id: 'HPC0815', name: 'Router 1', equipmentType: 'Router' },
        { id: 'HPC0816', name: 'Router 2', equipmentType: 'Router' },
      ],
    });
  });

  it('normalizes a missing/null equipment_type to an empty string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ items: [{ id: 'HPC0815', name: 'Router 1', equipment_type: null }] })),
    );

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listEquipment();

    expect(result).toEqual({ ok: true, items: [{ id: 'HPC0815', name: 'Router 1', equipmentType: '' }] });
  });

  it('returns an empty list when the response has no items at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listEquipment();

    expect(result).toEqual({ ok: true, items: [] });
  });

  it('surfaces the raw http-error when the things call is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listEquipment();

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' });
  });

  it('surfaces a network error distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.test')));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.listEquipment();

    expect(result).toEqual({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND example.test' });
  });
});

describe('EquipmentCloudClient.getEquipmentAssignments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('flattens every installation event\'s `installed` sub-array, attaching that event\'s installed_on, and resolves set state labels', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/things/HPC0815/installed') {
        return Promise.resolve(
          jsonResponse({
            items: [
              {
                installed_on: '2026-01-10T09:00:00Z',
                comments: 'Initial rollout',
                installed: [
                  { software_id: 155, software: 'MS Word', category: 'Office', version_id: 30, version: '2016' },
                  { software_id: 156, software: 'Windows 10', category: 'OS', version_id: 40, version: '21H2' },
                ],
              },
              {
                installed_on: '2026-02-01T09:00:00Z',
                installed: [{ software_id: 157, software: 'Antivirus', category: 'Security', version_id: 1, version: '1.0' }],
              },
            ],
          }),
        );
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/releases') {
        return Promise.resolve(jsonResponse({ items: [{ release_id: 'RELEASED', label: 'Released' }] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/things/HPC0815/sets') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 2, name: 'Office Set', state: 'RELEASED', updated_on: '2026-03-01T10:00:00Z' }],
          }),
        );
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('HPC0815');

    expect(result).toEqual({
      ok: true,
      installed: [
        { softwareId: 155, software: 'MS Word', category: 'Office', versionId: 30, version: '2016', installedOn: '2026-01-10T09:00:00Z' },
        { softwareId: 156, software: 'Windows 10', category: 'OS', versionId: 40, version: '21H2', installedOn: '2026-01-10T09:00:00Z' },
        { softwareId: 157, software: 'Antivirus', category: 'Security', versionId: 1, version: '1.0', installedOn: '2026-02-01T09:00:00Z' },
      ],
      sets: [{ id: 2, name: 'Office Set', state: 'RELEASED', stateLabel: 'Released', updatedOn: '2026-03-01T10:00:00Z' }],
    });
  });

  it('encodes the equipment id into both the installed and sets URLs', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/things/EQ%2F1/installed') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/releases') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/things/EQ%2F1/sets') {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('EQ/1');

    expect(result).toEqual({ ok: true, installed: [], sets: [] });
  });

  it('returns empty installed/sets lists when equipment has nothing installed/assigned', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/installed')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.endsWith('/releases')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.endsWith('/sets')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('HPC0815');

    expect(result).toEqual({ ok: true, installed: [], sets: [] });
  });

  it('aggregates multi-page assigned sets via controls[0].next', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/installed')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.endsWith('/releases')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url === 'https://example.test/cloudconnect/api/softwarecenter/v1/things/HPC0815/sets') {
        return Promise.resolve(
          jsonResponse({
            items: [{ id: 1, name: 'Set A', state: 'DRAFT', updated_on: null }],
            controls: [{ next: 'https://example.test/sets-page2' }],
          }),
        );
      }
      if (url === 'https://example.test/sets-page2') {
        return Promise.resolve(jsonResponse({ items: [{ id: 2, name: 'Set B', state: 'DRAFT', updated_on: null }] }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('HPC0815');

    expect(result.ok).toBe(true);
    expect(result.ok && result.sets.map((set) => set.id)).toEqual([1, 2]);
  });

  it('surfaces the raw http-error when the installed call is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 })));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('HPC0815');

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized' });
  });

  it('surfaces the raw http-error when the sets call is rejected', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/installed')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.endsWith('/releases')) {
        return Promise.resolve(jsonResponse({ items: [] }));
      }
      if (url.endsWith('/sets')) {
        return Promise.resolve(new Response('Forbidden', { status: 403 }));
      }
      throw new Error(`unexpected fetch to ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('HPC0815');

    expect(result).toEqual({ ok: false, kind: 'http-error', status: 403, body: 'Forbidden' });
  });

  it('surfaces a network error distinctly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND example.test')));

    const client = new EquipmentCloudClient('https://example.test', CREDENTIALS);
    const result = await client.getEquipmentAssignments('HPC0815');

    expect(result).toEqual({ ok: false, kind: 'network-error', message: 'getaddrinfo ENOTFOUND example.test' });
  });
});
