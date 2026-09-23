import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { KeyringCredentialsAdapter } from '../adapters/credentials/keyring-credentials-adapter.js';
import { createEquipmentCloudClient } from '../adapters/equipmentcloud/equipmentcloud-client.js';
import type { CredentialsSource } from '../adapters/equipmentcloud/equipmentcloud-port.js';
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
  /**
   * Injectable for tests — defaults to the real Windows-Credential-Manager-backed
   * adapter. Also required to implement `CredentialsSource` (raw credential read),
   * used only to construct the EquipmentCloud client for `/api/settings/test-connection`;
   * the domain-facing `CredentialsPort` itself never gains this capability.
   */
  credentialsPort?: CredentialsPort & CredentialsSource;
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

  app.post<{ Body: { environment?: unknown } }>('/api/settings/test-connection', async (request, reply) => {
    const body = request.body ?? {};
    const { environment } = body;

    if (!isEnvironment(environment)) {
      return reply.code(400).send({ error: 'INVALID_ENVIRONMENT' });
    }

    // Raw credentials are read only inside createEquipmentCloudClient (the
    // EquipmentCloud adapter's construction step) — this handler never sees
    // them, only the resulting client or `null`.
    const client = createEquipmentCloudClient(environment, credentialsPort);
    if (!client) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    return client.checkConnection();
  });

  // No request body (unlike the POST routes above) — reads the module-level
  // `activeEnvironment` directly, per Story 1.4's "Code Map" note.
  app.get('/api/software', async (_request, reply) => {
    if (!activeEnvironment) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    const client = createEquipmentCloudClient(activeEnvironment, credentialsPort);
    if (!client) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    const [softwareResult, setsResult] = await Promise.all([client.listSoftware(), client.listSets()]);
    if (!softwareResult.ok) {
      return softwareResult;
    }
    if (!setsResult.ok) {
      return setsResult;
    }

    return { software: softwareResult.items, sets: setsResult.items };
  });

  // Same NOT_CONFIGURED convention as GET /api/software, per Story 1.5's "Code Map" note.
  app.get('/api/equipment', async (_request, reply) => {
    if (!activeEnvironment) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    const client = createEquipmentCloudClient(activeEnvironment, credentialsPort);
    if (!client) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    return client.listEquipment();
  });

  app.get<{ Params: { id: string } }>('/api/equipment/:id/assignments', async (request, reply) => {
    if (!activeEnvironment) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    const client = createEquipmentCloudClient(activeEnvironment, credentialsPort);
    if (!client) {
      return reply.code(409).send({ error: 'NOT_CONFIGURED' });
    }

    return client.getEquipmentAssignments(request.params.id);
  });

  await app.register(fastifyStatic, {
    root: frontendDist,
  });

  return app;
}
