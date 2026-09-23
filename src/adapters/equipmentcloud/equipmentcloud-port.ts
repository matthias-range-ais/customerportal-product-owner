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
  updatedOn: string;
}

export type SoftwareListResult = { ok: true; items: SoftwareItem[] } | EquipmentCloudFailure;

export type SoftwareSetListResult = { ok: true; items: SoftwareSetItem[] } | EquipmentCloudFailure;

/** One `equipmenthub/v1/things` item (Story 1.5) — always `hierarchy_type: 'things'`. */
export interface EquipmentItem {
  id: string;
  name: string;
  equipmentType: string;
}

/**
 * One flattened "currently installed" entry for a piece of equipment — the
 * `.../things/{id}/installed` response's outer items each represent one installation event
 * (`installed_on`, `comments`, an `installed: [...]` sub-array of individual software+version
 * entries); every outer entry's `installed` sub-array is flattened into a combined list like
 * this one, attaching that entry's `installed_on`, per the Story 1.5 "Decided" note.
 */
export interface InstalledSoftwareItem {
  softwareId: number;
  software: string;
  category: string;
  versionId: number;
  version: string;
  installedOn: string;
}

/** One `.../things/{id}/sets` item — same shape as `SoftwareSetItem` minus `category`, which this response doesn't carry. */
export interface AssignedSetItem {
  id: number;
  name: string;
  state: string;
  stateLabel: string;
  updatedOn: string;
}

export type EquipmentListResult = { ok: true; items: EquipmentItem[] } | EquipmentCloudFailure;

export type EquipmentAssignmentsResult =
  | { ok: true; installed: InstalledSoftwareItem[]; sets: AssignedSetItem[] }
  | EquipmentCloudFailure;

/** Read-only EquipmentCloud port; reused by later epics. */
export interface EquipmentCloudPort {
  checkConnection(): Promise<ConnectionCheckResult>;
  /** All shared software (`sharedsoftware`), each enriched with its description and versions. */
  listSoftware(): Promise<SoftwareListResult>;
  /** All shared software sets (`sharedsets`), each with its release-state label resolved. */
  listSets(): Promise<SoftwareSetListResult>;
  /** All equipment (`equipmenthub/v1/things`, always `hierarchy_type: 'things'`). */
  listEquipment(): Promise<EquipmentListResult>;
  /** One piece of equipment's currently installed software (flattened) and assigned sets. */
  getEquipmentAssignments(equipmentId: string): Promise<EquipmentAssignmentsResult>;
}
