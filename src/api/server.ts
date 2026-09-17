import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';

try {
  const app = await buildApp();
  await app.listen({ port, host });
} catch (err) {
  console.error(err);
  process.exit(1);
}
