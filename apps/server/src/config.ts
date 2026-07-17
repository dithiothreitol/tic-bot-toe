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
  /** Where the word-game `.dawg` dictionaries live; undefined = the package default. */
  lexiconDir: string | undefined;
  /**
   * The AI-coach (§12.1) Gemini key. A SERVER secret funded by the owner, NOT a
   * per-user BYOK key — empty means the funded coach is simply unavailable (the
   * BYOK commentator still works). Never sent to the browser.
   */
  geminiApiKey: string;
  /** Gemini model for the coach. Owner sets whatever their key can call. */
  geminiModel: string;
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
    lexiconDir: env.LEXICON_DIR ?? undefined,
    // Its OWN var, not the dev-time asset-gen GEMINI_API_KEY — otherwise a key set
    // for image generation would silently switch on a paid, public coach in prod.
    geminiApiKey: env.GEMINI_COACH_API_KEY ?? '',
    // `gemini-flash-latest` is NOT a native-API alias — pin a concrete model.
    // Lower this (e.g. gemini-2.5-flash) if the key lacks 3.5 access.
    geminiModel: env.GEMINI_COACH_MODEL ?? 'gemini-3.5-flash',
  };
}
