import { beforeEach, describe, expect, it, vi } from 'vitest';

// In-memory stand-in for the OS credential store, keyed by "service:account",
// so these unit tests never touch the real Windows Credential Manager.
const store = new Map<string, string>();

vi.mock('@napi-rs/keyring', () => {
  class Entry {
    private readonly key: string;

    constructor(service: string, account: string) {
      this.key = `${service}:${account}`;
    }

    setPassword(password: string): void {
      store.set(this.key, password);
    }

    getPassword(): string | null {
      return store.get(this.key) ?? null;
    }

    deletePassword(): boolean {
      return store.delete(this.key);
    }
  }

  return { Entry };
});

const { KeyringCredentialsAdapter } = await import('./keyring-credentials-adapter.js');
const { Entry } = await import('@napi-rs/keyring');

describe('KeyringCredentialsAdapter', () => {
  beforeEach(() => {
    store.clear();
  });

  it('reports an environment as not configured when nothing has been saved', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    expect(adapter.hasCredentials('test')).toBe(false);
    expect(adapter.hasCredentials('prod')).toBe(false);
  });

  it('reports an environment as configured once credentials are saved', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    adapter.saveCredentials('prod', 'alice', 'secret');

    expect(adapter.hasCredentials('prod')).toBe(true);
  });

  it('keeps test and prod credentials independent of each other', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    adapter.saveCredentials('test', 'alice', 'secret1');

    expect(adapter.hasCredentials('test')).toBe(true);
    expect(adapter.hasCredentials('prod')).toBe(false);
  });

  it('overwrites the previous entry when saving again for the same environment', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    adapter.saveCredentials('test', 'alice', 'secret1');
    adapter.saveCredentials('test', 'bob', 'secret2');

    expect(store.get('test-service:test')).toBe(JSON.stringify({ username: 'bob', password: 'secret2' }));
  });

  it('stores the username/password pair as JSON, never as separate readable fields', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    adapter.saveCredentials('prod', 'alice', 'hunter2');

    expect(store.get('test-service:prod')).toBe(JSON.stringify({ username: 'alice', password: 'hunter2' }));
  });

  it('throws a distinguishable error when the credential store rejects the write', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');
    const setPasswordSpy = vi.spyOn(Entry.prototype, 'setPassword').mockImplementation(() => {
      throw new Error('store is locked');
    });

    try {
      expect(() => adapter.saveCredentials('test', 'alice', 'secret')).toThrow(
        /credential store is locked or inaccessible/,
      );
    } finally {
      setPasswordSpy.mockRestore();
    }
  });

  it('returns null for getUsername when the environment is not configured', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    expect(adapter.getUsername('test')).toBeNull();
  });

  it('returns the stored username, never the password, for a configured environment', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    adapter.saveCredentials('prod', 'alice', 'hunter2');

    expect(adapter.getUsername('prod')).toBe('alice');
  });

  it('returns null for getCredentials when the environment is not configured', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    expect(adapter.getCredentials('test')).toBeNull();
  });

  it('returns the stored username and password for getCredentials on a configured environment', () => {
    const adapter = new KeyringCredentialsAdapter('test-service');

    adapter.saveCredentials('prod', 'alice', 'hunter2');

    expect(adapter.getCredentials('prod')).toEqual({ username: 'alice', password: 'hunter2' });
  });

  it('uses separate entries for two adapters pointed at different services', () => {
    const appAdapter = new KeyringCredentialsAdapter('customerportal-product-owner');
    const otherAdapter = new KeyringCredentialsAdapter('some-other-app');

    appAdapter.saveCredentials('test', 'alice', 'secret1');

    expect(appAdapter.hasCredentials('test')).toBe(true);
    expect(otherAdapter.hasCredentials('test')).toBe(false);
  });
});
