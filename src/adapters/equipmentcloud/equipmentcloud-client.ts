import type { Environment } from '../../domain/credentials-port.js';
import type {
  AssignedSetItem,
  ConnectionCheckResult,
  CredentialsSource,
  EquipmentAssignmentsResult,
  EquipmentCloudFailure,
  EquipmentCloudPort,
  EquipmentItem,
  EquipmentListResult,
  InstalledSoftwareItem,
  SoftwareItem,
  SoftwareListResult,
  SoftwareSetItem,
  SoftwareSetListResult,
  SoftwareVersion,
  StoredCredentials,
} from './equipmentcloud-port.js';

const PING_PATH = '/cloudconnect/api/softwarecenter/v1/ping';
const SHAREDSOFTWARE_PATH = '/cloudconnect/api/softwarecenter/v1/sharedsoftware';
const SHAREDSETS_PATH = '/cloudconnect/api/softwarecenter/v1/sharedsets';
const RELEASES_PATH = '/cloudconnect/api/softwarecenter/v1/releases';
// Always `hierarchy_type: 'things'` — per Story 1.5's "Decided" note, never exposed as a
// parameter anywhere in this adapter, the route, or the UI (hierarchy browsing is out of scope).
const THINGS_PATH = '/cloudconnect/api/equipmenthub/v1/things';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ERROR_BODY_LENGTH = 500;
// Bounded per the Story 1.4 "Always" note — follows `controls.next` but never loops forever
// on a misbehaving or circular pagination chain.
const MAX_PAGES = 50;

/** One page of a `sharedsoftware`/`sharedsets`/`releases` list response. */
interface ListPage<T> {
  items: T[];
  // The API wraps the pagination links in a one-element array, not a bare object.
  controls?: Array<{ first?: string; next?: string; prev?: string }>;
}

// `category` is typed nullable: the live API omits or nulls it for uncategorized items,
// unlike openapi_equipmentcloud_preview.yaml's documented (always-present) shape.
type RawSoftwareListItem = { id: number; name: string; category: string | null | undefined };
type RawSoftwareDetailItem = {
  id: number;
  name: string;
  category: string;
  description?: string;
  versions?: SoftwareVersion[];
};
type RawSoftwareSetItem = {
  id: number;
  name: string;
  category: string | null | undefined;
  state: string;
  updated_on: string | null | undefined;
};
type RawReleaseItem = { release_id: string; label: string };

// Fields typed nullable per this file's established defensive convention: `id`/`name`/
// `equipment_type` are documented as always-present strings in
// openapi_equipmentcloud_preview.yaml's `things` example, but that example hasn't been verified
// against a live EquipmentCloud response in this session (same caveat as Story 1.4's `category`,
// which the live API did diverge from despite being always-present in its own documented example).
type RawEquipmentItem = { id?: string | null; name?: string | null; equipment_type?: string | null };

// One entry inside a `.../things/{id}/installed` outer item's `installed` sub-array. Field names
// match openapi_equipmentcloud_preview.yaml's documented example response for this endpoint, but
// that hasn't been verified against a live EquipmentCloud response in this session — same caveat
// as Story 1.4's `category`, so every field is handled defensively below regardless.
type RawInstalledEntry = {
  software_id?: number | null;
  software?: string | null;
  category?: string | null;
  version_id?: number | null;
  version?: string | null;
};
// One outer `.../things/{id}/installed` item — one installation event.
type RawInstalledEvent = {
  installed_on?: string | null;
  comments?: string | null;
  installed?: RawInstalledEntry[] | null;
};
// Same shape as `RawSoftwareSetItem` minus `category`, which this response doesn't carry.
type RawAssignedSetItem = { id: number; name: string; state: string; updated_on: string | null | undefined };

type FetchResult<T> = { ok: true; data: T } | EquipmentCloudFailure;

/**
 * Caps an error response body before it's returned to callers and ultimately
 * displayed in the UI — EquipmentCloud error bodies are unbounded (e.g. full
 * HTML error pages), so this keeps the surfaced message readable.
 */
function truncateBody(body: string): string {
  return body.length > MAX_ERROR_BODY_LENGTH ? `${body.slice(0, MAX_ERROR_BODY_LENGTH)}…` : body;
}

// Hardcoded per the Story 1.3 "Decided" note — never mixed, never overridden
// by user input. `prod`'s container path is specific to this deployment.
const DEFAULT_BASE_URLS: Record<Environment, string> = {
  test: 'https://eqcloud-test.ad.kontron-ais.com/DEV',
  prod: 'https://eqcloud.kontron-ais.com/C1681906',
};

export function resolveBaseUrl(environment: Environment): string {
  return DEFAULT_BASE_URLS[environment];
}

/** Builds `/cloudconnect/api/softwarecenter/v1/things/{id}/{installed,sets}` for one equipment ID. */
function thingAssignmentsPath(equipmentId: string, kind: 'installed' | 'sets'): string {
  return `/cloudconnect/api/softwarecenter/v1/things/${encodeURIComponent(equipmentId)}/${kind}`;
}

/**
 * BasicAuth EquipmentCloud client. Takes a base URL and credential set at
 * construction, keeping it environment-agnostic so later epics' read ports
 * can reuse it. Never logs or otherwise exposes the password after
 * construction.
 *
 * Uses the global `fetch` (no HTTP client dependency in package.json) and an
 * `AbortController` so a hung network call can't freeze the caller
 * indefinitely.
 */
export class EquipmentCloudClient implements EquipmentCloudPort {
  constructor(
    private readonly baseUrl: string,
    private readonly credentials: StoredCredentials,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {}

  async checkConnection(): Promise<ConnectionCheckResult> {
    const url = `${this.baseUrl}${PING_PATH}`;
    const authHeader = `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64')}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: authHeader },
        signal: controller.signal,
      });

      if (response.ok) {
        return { ok: true };
      }

      const body = await response.text();
      return { ok: false, kind: 'http-error', status: response.status, body: truncateBody(body) };
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        return { ok: false, kind: 'timeout' };
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, kind: 'network-error', message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * All shared software, each enriched with its `description` + `versions` via a per-item
   * `GET sharedsoftware/{id}` (fetched in parallel once the list itself is aggregated).
   */
  async listSoftware(): Promise<SoftwareListResult> {
    const listResult = await this.fetchAllPages<RawSoftwareListItem>(`${this.baseUrl}${SHAREDSOFTWARE_PATH}`);
    if (!listResult.ok) {
      return listResult;
    }

    const detailResults = await Promise.all(
      listResult.data.map((item) =>
        this.getJson<ListPage<RawSoftwareDetailItem>>(`${this.baseUrl}${SHAREDSOFTWARE_PATH}/${item.id}`),
      ),
    );

    const items: SoftwareItem[] = [];
    for (let index = 0; index < listResult.data.length; index++) {
      const detailResult = detailResults[index];
      if (!detailResult.ok) {
        return detailResult;
      }

      const base = listResult.data[index];
      const detail = detailResult.data.items?.[0];
      if (!detail) {
        // Item deleted between the list call and this detail call — surface it as an
        // explicit failure rather than silently defaulting to an empty description/versions.
        return {
          ok: false,
          kind: 'http-error',
          status: 404,
          body: `sharedsoftware/${base.id}: item not found (removed after the list call)`,
        };
      }
      items.push({
        id: base.id,
        name: base.name,
        category: base.category ?? '',
        description: detail.description ?? '',
        versions: detail.versions ?? [],
      });
    }

    return { ok: true, items };
  }

  /**
   * All shared software sets, each with its raw release `state` resolved to a human label via a
   * single `GET .../releases` lookup (falling back to the raw state string if unmapped).
   */
  async listSets(): Promise<SoftwareSetListResult> {
    const labelsResult = await this.loadStateLabels();
    if (!labelsResult.ok) {
      return labelsResult;
    }

    const setsResult = await this.fetchAllPages<RawSoftwareSetItem>(`${this.baseUrl}${SHAREDSETS_PATH}`);
    if (!setsResult.ok) {
      return setsResult;
    }

    const items: SoftwareSetItem[] = setsResult.data.map((set) => ({
      id: set.id,
      name: set.name,
      category: set.category ?? '',
      state: set.state,
      stateLabel: labelsResult.data.get(set.state) ?? set.state,
      updatedOn: set.updated_on ?? '',
    }));

    return { ok: true, items };
  }

  /** All equipment (`equipmenthub/v1/things`) — a single call, no pagination (this list has no `controls`). */
  async listEquipment(): Promise<EquipmentListResult> {
    const result = await this.getJson<{ items?: RawEquipmentItem[] }>(`${this.baseUrl}${THINGS_PATH}`);
    if (!result.ok) {
      return result;
    }

    const items: EquipmentItem[] = (result.data.items ?? []).map((item) => ({
      id: item.id ?? '',
      name: item.name ?? '',
      equipmentType: item.equipment_type ?? '',
    }));

    return { ok: true, items };
  }

  /**
   * One piece of equipment's currently installed software (flattened, per Story 1.5's "Decided"
   * note — every outer `.../installed` entry's `installed` sub-array is combined into one list,
   * attaching that entry's `installed_on`) and its assigned sets (paginated like `listSets()`,
   * reusing the same release-state label lookup via `loadStateLabels()`).
   */
  async getEquipmentAssignments(equipmentId: string): Promise<EquipmentAssignmentsResult> {
    const installedResult = await this.getJson<{ items?: RawInstalledEvent[] }>(
      `${this.baseUrl}${thingAssignmentsPath(equipmentId, 'installed')}`,
    );
    if (!installedResult.ok) {
      return installedResult;
    }

    const installed: InstalledSoftwareItem[] = [];
    for (const event of installedResult.data.items ?? []) {
      const installedOn = event.installed_on ?? '';
      for (const entry of event.installed ?? []) {
        installed.push({
          softwareId: entry.software_id ?? 0,
          software: entry.software ?? '',
          category: entry.category ?? '',
          versionId: entry.version_id ?? 0,
          version: entry.version ?? '',
          installedOn,
        });
      }
    }

    const labelsResult = await this.loadStateLabels();
    if (!labelsResult.ok) {
      return labelsResult;
    }

    const setsResult = await this.fetchAllPages<RawAssignedSetItem>(
      `${this.baseUrl}${thingAssignmentsPath(equipmentId, 'sets')}`,
    );
    if (!setsResult.ok) {
      return setsResult;
    }

    const sets: AssignedSetItem[] = setsResult.data.map((set) => ({
      id: set.id,
      name: set.name,
      state: set.state,
      stateLabel: labelsResult.data.get(set.state) ?? set.state,
      updatedOn: set.updated_on ?? '',
    }));

    return { ok: true, installed, sets };
  }

  /**
   * Resolves the release `state` → human label lookup via a single `GET .../releases` call.
   * Factored out of `listSets()` so `getEquipmentAssignments()` can reuse the exact same lookup
   * instead of duplicating the `RELEASES_PATH` fetch + `Map` construction, per Story 1.5's
   * "Decided" note.
   */
  private async loadStateLabels(): Promise<FetchResult<Map<string, string>>> {
    const releasesResult = await this.fetchAllPages<RawReleaseItem>(`${this.baseUrl}${RELEASES_PATH}`);
    if (!releasesResult.ok) {
      return releasesResult;
    }
    return { ok: true, data: new Map(releasesResult.data.map((release) => [release.release_id, release.label])) };
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.credentials.username}:${this.credentials.password}`).toString('base64')}`;
  }

  /** GETs and JSON-parses `url`, sharing the same auth/timeout/error handling as `checkConnection`. */
  private async getJson<T>(url: string): Promise<FetchResult<T>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader() },
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        return { ok: false, kind: 'http-error', status: response.status, body: truncateBody(body) };
      }

      const data = (await response.json()) as T;
      return { ok: true, data };
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') {
        return { ok: false, kind: 'timeout' };
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, kind: 'network-error', message };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Follows `controls[0].next` (per the API's pagination shape) up to `MAX_PAGES`, aggregating
   * all items. The live API emits a `next` link even past the last page of real data — that page
   * comes back with no `items` at all rather than an empty array — so a page with no items ends
   * pagination regardless of whether `next` is still present.
   */
  private async fetchAllPages<T>(initialUrl: string): Promise<FetchResult<T[]>> {
    const allItems: T[] = [];
    let url: string | undefined = initialUrl;
    let pageCount = 0;

    while (url && pageCount < MAX_PAGES) {
      const pageResult: FetchResult<ListPage<T>> = await this.getJson<ListPage<T>>(url);
      if (!pageResult.ok) {
        return pageResult;
      }

      const pageItems = pageResult.data.items ?? [];
      if (pageItems.length === 0) {
        break;
      }

      allItems.push(...pageItems);
      url = pageResult.data.controls?.[0]?.next;
      pageCount++;
    }

    return { ok: true, data: allItems };
  }
}

/**
 * Builds an `EquipmentCloudClient` for the given environment, or `null` if
 * that environment has no stored credentials. This is the one place the raw
 * `{username, password}` pair is read out of `credentialsSource` — callers
 * (route handlers) only ever see the resulting client or `null`, never the
 * credentials themselves.
 */
export function createEquipmentCloudClient(
  environment: Environment,
  credentialsSource: CredentialsSource,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): EquipmentCloudClient | null {
  const credentials = credentialsSource.getCredentials(environment);
  if (!credentials) {
    return null;
  }
  return new EquipmentCloudClient(resolveBaseUrl(environment), credentials, timeoutMs);
}
