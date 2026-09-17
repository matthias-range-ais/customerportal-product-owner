// Pure domain contract — no HTTP client, Fastify, DB driver, or credential
// library import belongs in this file (Ports & Adapters boundary).

export type Environment = 'test' | 'prod';

export function isEnvironment(value: unknown): value is Environment {
  return value === 'test' || value === 'prod';
}

/**
 * Stores and checks EquipmentCloud credentials for a given environment.
 *
 * No method here may return a raw secret — the settings screen can only show
 * whether an environment is configured, never the stored password. Only a
 * later EquipmentCloud-adapter construction step (Story 1.3) reads a raw
 * credential, and it does so directly from the concrete credentials adapter,
 * not through this port.
 */
export interface CredentialsPort {
  saveCredentials(environment: Environment, username: string, password: string): void;
  hasCredentials(environment: Environment): boolean;
}
