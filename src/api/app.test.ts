import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import type { CredentialsSource } from '../adapters/equipmentcloud/equipmentcloud-port.js';
import type { CredentialsPort, Environment } from '../domain/credentials-port.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
const indexHtml = path.join(frontendDist, 'index.html');
const indexHtmlMoved = `${indexHtml}.movedForTest`;

// In-memory test double — no test in this file should ever touch the real
// Windows Credential Manager via the default KeyringCredentialsAdapter.
class InMemoryCredentialsPort implements CredentialsPort, CredentialsSource {
  private readonly store = new Map<Environment, { username: string; password: string }>();

  saveCredentials(environment: Environment, username: string, password: string): void {
    this.store.set(environment, { username, password });
  }

  hasCredentials(environment: Environment): boolean {
    return this.store.has(environment);
  }

  getUsername(environment: Environment): string | null {
    return this.store.get(environment)?.username ?? null;
  }

  getCredentials(environment: Environment): { username: string; password: string } | null {
    return this.store.get(environment) ?? null;
  }
}

// Stand-in that always fails the write, for exercising the storage-error path.
class FailingCredentialsPort implements CredentialsPort, CredentialsSource {
  saveCredentials(): never {
    throw new Error('store is locked');
  }

  hasCredentials(): boolean {
    return false;
  }

  getUsername(): string | null {
    return null;
  }

  getCredentials(): { username: string; password: string } | null {
    return null;
  }
}

describe('buildApp', () => {
  afterEach(() => {
    if (existsSync(indexHtmlMoved)) {
      renameSync(indexHtmlMoved, indexHtml);
    }
  });

  it('fails fast with a clear error when the frontend has not been built', async () => {
    renameSync(indexHtml, indexHtmlMoved);

    await expect(buildApp({ credentialsPort: new InMemoryCredentialsPort() })).rejects.toThrow(
      'run `npm run build` before starting the server',
    );
  });

  it('serves the built frontend shell on GET /', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>customerportal-product-owner</title>');
    expect(response.body).toContain('<div id="root">');

    await app.close();
  });

  it('serves a built JS bundle that renders the German landing-page text', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const page = await app.inject({ method: 'GET', url: '/' });
    const scriptSrc = page.body.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];
    expect(scriptSrc, 'expected an inline <script src="...js"> in the built HTML').toBeDefined();

    const bundle = await app.inject({ method: 'GET', url: scriptSrc! });

    expect(bundle.statusCode).toBe(200);
    expect(bundle.body).toContain('EquipmentCloud');

    await app.close();
  });
});

describe('settings routes', () => {
  afterEach(() => {
    if (existsSync(indexHtmlMoved)) {
      renameSync(indexHtmlMoved, indexHtml);
    }
  });

  it('shows both environments as not configured and no active environment on first launch', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({ method: 'GET', url: '/api/settings' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      environments: { test: { configured: false }, prod: { configured: false } },
      active: null,
      activeUsername: null,
    });

    await app.close();
  });

  it('does not activate the configured initial environment if it has no stored credentials', async () => {
    const app = await buildApp({
      logger: false,
      credentialsPort: new InMemoryCredentialsPort(),
      initialEnvironment: 'prod',
    });

    const response = await app.inject({ method: 'GET', url: '/api/settings' });

    expect(response.json().active).toBeNull();

    await app.close();
  });

  it('activates the initial environment at startup when it already has stored credentials', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'secret');

    const app = await buildApp({ logger: false, credentialsPort, initialEnvironment: 'test' });

    const response = await app.inject({ method: 'GET', url: '/api/settings' });

    expect(response.json().active).toBe('test');

    await app.close();
  });

  it('saves credentials for an environment and marks it as configured', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'test', username: 'alice', password: 'secret' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.environments.test.configured).toBe(true);
    expect(body.environments.prod.configured).toBe(false);
    expect(JSON.stringify(body)).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('alice');

    await app.close();
  });

  it('overwrites previously stored credentials for the same environment', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'oldsecret');
    const app = await buildApp({ logger: false, credentialsPort });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'test', username: 'bob', password: 'newsecret' },
    });

    expect(response.statusCode).toBe(200);
    expect(credentialsPort.hasCredentials('test')).toBe(true);

    await app.close();
  });

  it('rejects saving credentials with an empty username', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    const app = await buildApp({ logger: false, credentialsPort });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'test', username: '', password: 'secret' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'MISSING_CREDENTIALS' });
    expect(credentialsPort.hasCredentials('test')).toBe(false);

    await app.close();
  });

  it('rejects saving credentials with an empty password', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    const app = await buildApp({ logger: false, credentialsPort });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'test', username: 'alice', password: '   ' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'MISSING_CREDENTIALS' });
    expect(credentialsPort.hasCredentials('test')).toBe(false);

    await app.close();
  });

  it('rejects saving credentials with a whitespace-only username', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    const app = await buildApp({ logger: false, credentialsPort });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'test', username: '   ', password: 'secret' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'MISSING_CREDENTIALS' });
    expect(credentialsPort.hasCredentials('test')).toBe(false);

    await app.close();
  });

  it('returns a storage error when the credentials store rejects the write', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new FailingCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'test', username: 'alice', password: 'secret' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'STORAGE_ERROR' });

    await app.close();
  });

  it('rejects saving credentials for an unknown environment', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/credentials',
      payload: { environment: 'staging', username: 'alice', password: 'secret' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_ENVIRONMENT' });

    await app.close();
  });

  it('activates an environment that has stored credentials', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'secret');
    const app = await buildApp({ logger: false, credentialsPort });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/active-environment',
      payload: { environment: 'test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().active).toBe('test');
    expect(response.json().activeUsername).toBe('alice');

    await app.close();
  });

  it('rejects activating an environment that has no stored credentials', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/active-environment',
      payload: { environment: 'prod' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'NOT_CONFIGURED' });

    const status = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(status.json().active).toBeNull();

    await app.close();
  });

  it('switches the active environment back and forth between two configured environments', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'secret');
    credentialsPort.saveCredentials('prod', 'bob', 'secret2');
    const app = await buildApp({ logger: false, credentialsPort, initialEnvironment: 'test' });

    const toProd = await app.inject({
      method: 'POST',
      url: '/api/settings/active-environment',
      payload: { environment: 'prod' },
    });
    expect(toProd.statusCode).toBe(200);
    expect(toProd.json().active).toBe('prod');

    const backToTest = await app.inject({
      method: 'POST',
      url: '/api/settings/active-environment',
      payload: { environment: 'test' },
    });
    expect(backToTest.statusCode).toBe(200);
    expect(backToTest.json().active).toBe('test');

    await app.close();
  });

  it('rejects activating an unknown environment', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/active-environment',
      payload: { environment: 'staging' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_ENVIRONMENT' });

    await app.close();
  });
});

describe('POST /api/settings/test-connection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (existsSync(indexHtmlMoved)) {
      renameSync(indexHtmlMoved, indexHtml);
    }
  });

  it('rejects an unknown environment', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/test-connection',
      payload: { environment: 'staging' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'INVALID_ENVIRONMENT' });

    await app.close();
  });

  it('rejects checking an environment with no stored credentials', async () => {
    const app = await buildApp({ logger: false, credentialsPort: new InMemoryCredentialsPort() });

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/test-connection',
      payload: { environment: 'test' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'NOT_CONFIGURED' });

    await app.close();
  });

  it('reports success and calls the prod base URL with a Basic Auth header built from stored credentials', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('prod', 'alice', 'secret');
    const app = await buildApp({ logger: false, credentialsPort });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/test-connection',
      payload: { environment: 'prod' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://eqcloud.kontron-ais.com/C1681906/cloudconnect/api/softwarecenter/v1/ping');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('alice:secret').toString('base64')}`);

    await app.close();
  });

  it('surfaces the raw EquipmentCloud error status and body when credentials are rejected', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'wrong');
    const app = await buildApp({ logger: false, credentialsPort });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Unauthorized: bad credentials', { status: 401 })),
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/test-connection',
      payload: { environment: 'test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: false, kind: 'http-error', status: 401, body: 'Unauthorized: bad credentials' });

    await app.close();
  });

  it('reports a network error distinctly from an EquipmentCloud error response', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'secret');
    const app = await buildApp({ logger: false, credentialsPort });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND eqcloud-test')));

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/test-connection',
      payload: { environment: 'test' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: false,
      kind: 'network-error',
      message: 'getaddrinfo ENOTFOUND eqcloud-test',
    });

    await app.close();
  });

  it('never includes the raw password in the response', async () => {
    const credentialsPort = new InMemoryCredentialsPort();
    credentialsPort.saveCredentials('test', 'alice', 'super-secret-password');
    const app = await buildApp({ logger: false, credentialsPort });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    const response = await app.inject({
      method: 'POST',
      url: '/api/settings/test-connection',
      payload: { environment: 'test' },
    });

    expect(JSON.stringify(response.json())).not.toContain('super-secret-password');

    await app.close();
  });
});
