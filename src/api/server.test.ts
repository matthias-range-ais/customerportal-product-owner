import { spawn } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const serverEntry = path.join(projectRoot, 'src', 'api', 'server.ts');
const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');

const frontendDist = path.join(projectRoot, 'frontend', 'dist');
const indexHtml = path.join(frontendDist, 'index.html');
const indexHtmlMoved = `${indexHtml}.movedForTest`;

function runServer(env: Record<string, string | undefined>) {
  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: projectRoot,
    env: { ...process.env, ...env },
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += String(chunk)));
  child.stderr.on('data', (chunk) => (stderr += String(chunk)));

  return {
    child,
    output: () => ({ stdout, stderr }),
  };
}

describe('server.ts entry point', () => {
  afterEach(() => {
    if (existsSync(indexHtmlMoved)) {
      renameSync(indexHtmlMoved, indexHtml);
    }
  });

  it('exits with code 1 and a clear message when the frontend has not been built', async () => {
    renameSync(indexHtml, indexHtmlMoved);

    const { child, output } = runServer({ PORT: '0', EQUIPMENTCLOUD_ENV: 'test' });
    const exitCode = await new Promise<number | null>((resolve) => {
      child.on('exit', resolve);
    });

    expect(exitCode).toBe(1);
    expect(output().stderr).toContain('run `npm run build` before starting the server');
  }, 15000);

  it('binds to the HOST/PORT given via environment variables', async () => {
    const { child, output } = runServer({ HOST: '127.0.0.1', PORT: '0', EQUIPMENTCLOUD_ENV: 'test' });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not log a listening message in time')), 10000);
        child.stdout.on('data', (chunk) => {
          if (String(chunk).includes('Server listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
        child.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`server exited early with code ${code}: ${output().stderr}`));
        });
      });
    } finally {
      child.kill();
    }
  }, 15000);
});
