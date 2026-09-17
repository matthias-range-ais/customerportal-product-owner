import { existsSync, renameSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { CredentialsPort, Environment } from '../domain/credentials-port.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');
const indexHtml = path.join(frontendDist, 'index.html');
const indexHtmlMoved = `${indexHtml}.movedForTest`;

// In-memory test double — no test in this file should ever touch the real
// Windows Credential Manager via the default KeyringCredentialsAdapter.
class InMemoryCredentialsPort implements CredentialsPort {
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
}

// Stand-in that always fails the write, for exercising the storage-error path.
class FailingCredentialsPort implements CredentialsPort {
  saveCredentials(): never {
    throw new Error('store is locked');
  }

  hasCredentials(): boolean {
    return false;
  }

  getUsername(): string | null {
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
