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

/** The failure arm shared by every EquipmentCloud read — same shape as `ConnectionCheckResult`'s. */
export type EquipmentCloudFailure = Exclude<ConnectionCheckResult, { ok: true }>;

/** One version of a shared software item (Story 1.4). */
export interface SoftwareVersion {
  id: number;
  name: string;
}

/** One `sharedsoftware` item, enriched with its per-item detail (`description` + `versions`). */
export interface SoftwareItem {
  id: number;
  name: string;
  category: string;
  description: string;
  versions: SoftwareVersion[];
}

/** One `sharedsets` item, with its raw release `state` and the label resolved via `GET .../releases`. */
export interface SoftwareSetItem {
  id: number;
  name: string;
  category: string;
  state: string;
  stateLabel: string;
}

export type SoftwareListResult = { ok: true; items: SoftwareItem[] } | EquipmentCloudFailure;

export type SoftwareSetListResult = { ok: true; items: SoftwareSetItem[] } | EquipmentCloudFailure;

/** Read-only EquipmentCloud port; reused by later epics. */
export interface EquipmentCloudPort {
  checkConnection(): Promise<ConnectionCheckResult>;
  /** All shared software (`sharedsoftware`), each enriched with its description and versions. */
  listSoftware(): Promise<SoftwareListResult>;
  /** All shared software sets (`sharedsets`), each with its release-state label resolved. */
  listSets(): Promise<SoftwareSetListResult>;
}
