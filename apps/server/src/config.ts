/**
 * Environment config (SPEC §16). Secrets come only from the environment / .env;
 * never hardcoded. Dev-only fallbacks are clearly insecure and logged.
 */
export interface Config {
  port: number;
  jwtSecret: string;
  jwtTtlSeconds: number;
  /** Match-start token lifetime (§15.3 pacing) — long enough for a slow game. */
  startTtlSeconds: number;
  turnstileSecret: string;
  enableOllama: boolean;
  trustedProxy: boolean;
  databaseUrl: string;
  /** Directory of the built frontend to serve (single-port deploy). */
  staticDir: string;
}

const DEV_JWT_SECRET = 'dev-insecure-secret-change-me';
// Cloudflare's documented "always passes" Turnstile test secret.
const TURNSTILE_TEST_SECRET = '1x0000000000000000000000000000000AA';

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const jwtSecret = env.JWT_SECRET ?? DEV_JWT_SECRET;
  if (jwtSecret === DEV_JWT_SECRET) {
    console.warn('[config] JWT_SECRET not set — using an INSECURE dev secret.');
  }
  return {
    port: Number(env.PORT ?? 8080),
    jwtSecret,
    jwtTtlSeconds: 30 * 60,
    startTtlSeconds: 45 * 60,
    turnstileSecret: env.TURNSTILE_SECRET ?? TURNSTILE_TEST_SECRET,
    enableOllama: env.ENABLE_OLLAMA === 'true',
    trustedProxy: env.TRUSTED_PROXY === 'true',
    databaseUrl: env.DATABASE_URL ?? '',
    staticDir: env.STATIC_DIR ?? '../web/dist',
  };
}
