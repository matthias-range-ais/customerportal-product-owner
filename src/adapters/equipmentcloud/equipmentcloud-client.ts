import type { Environment } from '../../domain/credentials-port.js';
import type { ConnectionCheckResult, CredentialsSource, EquipmentCloudPort, StoredCredentials } from './equipmentcloud-port.js';

const PING_PATH = '/cloudconnect/api/softwarecenter/v1/ping';
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_ERROR_BODY_LENGTH = 500;

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
