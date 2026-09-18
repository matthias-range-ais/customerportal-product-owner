import type { Environment } from '../../domain/credentials-port.js';
import type {
  ConnectionCheckResult,
  CredentialsSource,
  EquipmentCloudFailure,
  EquipmentCloudPort,
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

type RawSoftwareListItem = { id: number; name: string; category: string };
type RawSoftwareDetailItem = { id: number; name: string; category: string; description?: string; versions?: SoftwareVersion[] };
type RawSoftwareSetItem = { id: number; name: string; category: string; state: string };
type RawReleaseItem = { release_id: string; label: string };

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
      const detail = detailResult.data.items[0];
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
        category: base.category,
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
    const releasesResult = await this.fetchAllPages<RawReleaseItem>(`${this.baseUrl}${RELEASES_PATH}`);
    if (!releasesResult.ok) {
      return releasesResult;
    }

    const labelByState = new Map(releasesResult.data.map((release) => [release.release_id, release.label]));

    const setsResult = await this.fetchAllPages<RawSoftwareSetItem>(`${this.baseUrl}${SHAREDSETS_PATH}`);
    if (!setsResult.ok) {
      return setsResult;
    }

    const items: SoftwareSetItem[] = setsResult.data.map((set) => ({
      id: set.id,
      name: set.name,
      category: set.category,
      state: set.state,
      stateLabel: labelByState.get(set.state) ?? set.state,
    }));

    return { ok: true, items };
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

  /** Follows `controls[0].next` (per the API's pagination shape) up to `MAX_PAGES`, aggregating all items. */
  private async fetchAllPages<T>(initialUrl: string): Promise<FetchResult<T[]>> {
    const allItems: T[] = [];
    let url: string | undefined = initialUrl;
    let pageCount = 0;

    while (url && pageCount < MAX_PAGES) {
      const pageResult: FetchResult<ListPage<T>> = await this.getJson<ListPage<T>>(url);
      if (!pageResult.ok) {
        return pageResult;
      }

      allItems.push(...pageResult.data.items);
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
