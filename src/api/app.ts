import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { KeyringCredentialsAdapter } from '../adapters/credentials/keyring-credentials-adapter.js';
import { isEnvironment, type CredentialsPort, type Environment } from '../domain/credentials-port.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Matches Vite's default build.outDir ("dist") for frontend/ — keep both in sync if either changes.
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');

const ENVIRONMENTS: readonly Environment[] = ['test', 'prod'];

interface SettingsSnapshot {
  environments: Record<Environment, { configured: boolean }>;
  active: Environment | null;
  activeUsername: string | null;
}

export interface BuildAppOptions {
  logger?: boolean;
  /** Injectable for tests — defaults to the real Windows-Credential-Manager-backed adapter. */
  credentialsPort?: CredentialsPort;
  /**
   * Environment to try to make active at startup (from `EQUIPMENTCLOUD_ENV`, default `'prod'`).
   * Only takes effect if that environment already has stored credentials — otherwise no
   * environment is active, per the "first launch" behavior. Never persisted; in-memory only.
   */
  initialEnvironment?: Environment;
}

export async function buildApp(options: BuildAppOptions = {}) {
  const { logger = true, credentialsPort = new KeyringCredentialsAdapter(), initialEnvironment = 'prod' } = options;

  if (!existsSync(path.join(frontendDist, 'index.html'))) {
    throw new Error(
      `Frontend build not found at ${frontendDist} — run \`npm run build\` before starting the server.`,
    );
  }

  const app = Fastify({ logger });

  // In-memory only, per story 1.2's "Decided" note: never persisted, reset on every restart.
  let activeEnvironment: Environment | null = credentialsPort.hasCredentials(initialEnvironment)
    ? initialEnvironment
    : null;

  function settingsSnapshot(): SettingsSnapshot {
    const environments = {} as Record<Environment, { configured: boolean }>;
    for (const environment of ENVIRONMENTS) {
      environments[environment] = { configured: credentialsPort.hasCredentials(environment) };
    }
    return {
      environments,
      active: activeEnvironment,
      activeUsername: activeEnvironment ? credentialsPort.getUsername(activeEnvironment) : null,
    };
  }

  app.get('/api/settings', async () => settingsSnapshot());

  app.post<{ Body: { environment?: unknown; username?: unknown; password?: unknown } }>(
    '/api/settings/credentials',
    async (request, reply) => {
      const body = request.body ?? {};
      const { environment, username, password } = body;

      if (!isEnvironment(environment)) {
        return reply.code(400).send({ error: 'INVALID_ENVIRONMENT' });
      }

      if (typeof username !== 'string' || username.trim() === '' || typeof password !== 'string' || password.trim() === '') {
        return reply.code(400).send({ error: 'MISSING_CREDENTIALS' });
      }

      try {
        credentialsPort.saveCredentials(environment, username.trim(), password.trim());
      } catch {
        return reply.code(500).send({ error: 'STORAGE_ERROR' });
      }

      return settingsSnapshot();
    },
  );

  app.post<{ Body: { environment?: unknown } }>('/api/settings/active-environment', async (request, reply) => {
    const body = request.body ?? {};
    const { environment } = body;

    if (!isEnvironment(environment)) {
      return reply.code(400).send({ error: 'INVALID_ENVIRONMENT' });
    }

    if (!credentialsPort.hasCredentials(environment)) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    activeEnvironment = environment;

    return settingsSnapshot();
  });

  await app.register(fastifyStatic, {
    root: frontendDist,
  });

  return app;
}
