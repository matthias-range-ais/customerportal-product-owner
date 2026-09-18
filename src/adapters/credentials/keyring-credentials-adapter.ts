import { Entry } from '@napi-rs/keyring';
import type { CredentialsPort, Environment } from '../../domain/credentials-port.js';

const DEFAULT_SERVICE = 'customerportal-product-owner';

/**
 * `CredentialsPort` implementation backed by the OS credential store
 * (Windows Credential Manager, via `@napi-rs/keyring`).
 *
 * One `Entry` per environment: the `account` is fixed to the environment
 * name (`'test'` / `'prod'`) so an entry is always retrievable without
 * already knowing its username. The username/password pair is stored as a
 * single JSON string, since `Entry` only holds one secret value.
 */
export class KeyringCredentialsAdapter implements CredentialsPort {
  // `service` is overridable so tests can point at an isolated namespace
  // instead of this app's real Windows Credential Manager entries.
  constructor(private readonly service: string = DEFAULT_SERVICE) {}

  saveCredentials(environment: Environment, username: string, password: string): void {
    const entry = new Entry(this.service, environment);
    try {
      entry.setPassword(JSON.stringify({ username, password }));
    } catch (cause) {
      // Store locked/inaccessible — surface a clear, distinguishable failure
      // instead of letting a raw keyring error bubble up uninterpreted.
      throw new Error(`Failed to save credentials for "${environment}": credential store is locked or inaccessible.`, {
        cause,
      });
    }
  }

  hasCredentials(environment: Environment): boolean {
    return this.readStored(environment) !== null;
  }

  getUsername(environment: Environment): string | null {
    return this.readStored(environment)?.username ?? null;
  }

  /**
   * Returns the raw stored username/password pair for an environment, or
   * `null` if not configured. Deliberately **not** part of `CredentialsPort`
   * (the domain port stays secret-free) — only adapter-layer code (namely the
   * EquipmentCloud adapter's construction step, wired from the composition
   * root in `src/api/`) may call this.
   */
  getCredentials(environment: Environment): { username: string; password: string } | null {
    return this.readStored(environment);
  }

  private readStored(environment: Environment): { username: string; password: string } | null {
    const entry = new Entry(this.service, environment);
    try {
      const raw = entry.getPassword();
      return raw === null ? null : (JSON.parse(raw) as { username: string; password: string });
    } catch {
      // Store locked/inaccessible/ambiguous, or a malformed stored value —
      // treat as "not configured" rather than crash the settings screen;
      // saveCredentials will surface a real problem the next time it's attempted.
      return null;
    }
  }
}
