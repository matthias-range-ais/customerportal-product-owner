import { buildApp } from './app.js';
import { envOrDefault } from './env.js';

const port = Number(envOrDefault(process.env.PORT, '3000'));
const host = envOrDefault(process.env.HOST, '127.0.0.1');

try {
  const app = await buildApp();
  await app.listen({ port, host });
} catch (err) {
  console.error(err);
  process.exit(1);
}
