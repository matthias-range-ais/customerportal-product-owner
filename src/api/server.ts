import { buildApp } from './app.js';
import { envOrDefault } from './env.js';
import { isEnvironment, type Environment } from '../domain/credentials-port.js';

const port = Number(envOrDefault(process.env.PORT, '3000'));
const host = envOrDefault(process.env.HOST, '127.0.0.1');
const equipmentCloudEnvRaw = envOrDefault(process.env.EQUIPMENTCLOUD_ENV, 'prod');

function parseEquipmentCloudEnv(value: string): Environment {
  if (isEnvironment(value)) {
    return value;
  }
  throw new Error(`EQUIPMENTCLOUD_ENV must be "test" or "prod", got "${value}".`);
}

try {
  const initialEnvironment = parseEquipmentCloudEnv(equipmentCloudEnvRaw);
  const app = await buildApp({ initialEnvironment });
  await app.listen({ port, host });
} catch (err) {
  console.error(err);
  process.exit(1);
}
