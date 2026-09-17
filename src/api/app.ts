import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Matches Vite's default build.outDir ("dist") for frontend/ — keep both in sync if either changes.
const frontendDist = path.resolve(__dirname, '..', '..', 'frontend', 'dist');

export async function buildApp(options: { logger?: boolean } = {}) {
  const { logger = true } = options;

  if (!existsSync(path.join(frontendDist, 'index.html'))) {
    throw new Error(
      `Frontend build not found at ${frontendDist} — run \`npm run build\` before starting the server.`,
    );
  }

  const app = Fastify({ logger });

  await app.register(fastifyStatic, {
    root: frontendDist,
  });

  return app;
}
