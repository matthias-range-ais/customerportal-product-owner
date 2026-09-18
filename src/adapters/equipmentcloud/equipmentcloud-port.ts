// Adapter-facing contracts for the EquipmentCloud connection (Story 1.3).
// Not a domain port: it is fine for this file to be adapter-specific and to
// be depended on by the composition root (src/api/), unlike src/domain/*.

import type { Environment } from '../../domain/credentials-port.js';

export interface StoredCredentials {
  username: string;
  password: string;
}

/**
 * Adapter-only capability to read raw stored credentials for an environment.
 * Deliberately kept out of the domain `CredentialsPort` (which never returns
 * a password) — implemented by `KeyringCredentialsAdapter` and consumed only
 * by the EquipmentCloud client's construction step.
 */
export interface CredentialsSource {
  getCredentials(environment: Environment): StoredCredentials | null;
}

/** Outcome of a `GET .../ping` connection check — never persisted, UI-only. */
export type ConnectionCheckResult =
  | { ok: true }
  | { ok: false; kind: 'http-error'; status: number; body: string }
  | { ok: false; kind: 'network-error'; message: string }
  | { ok: false; kind: 'timeout' };

/** Read-only EquipmentCloud connection-check port; reused by later epics. */
export interface EquipmentCloudPort {
  checkConnection(): Promise<ConnectionCheckResult>;
}
