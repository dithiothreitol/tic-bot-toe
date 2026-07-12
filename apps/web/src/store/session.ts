import { create } from 'zustand';

/**
 * Short-lived session token (from Turnstile → /api/verify). Kept in memory only
 * (not persisted) — it's a 30-min one-use-ish credential for saving a result.
 * `ensureSession` opens the Turnstile dialog and resolves once verified.
 */
interface SessionState {
  token: string | null;
  expiresAt: number | null;
  promptOpen: boolean;
  openPrompt: () => void;
  closePrompt: () => void;
  setSession: (token: string, ttlSeconds: number) => void;
  clear: () => void;
}

export const useSession = create<SessionState>((set) => ({
  token: null,
  expiresAt: null,
  promptOpen: false,
  openPrompt: () => set({ promptOpen: true }),
  closePrompt: () => set({ promptOpen: false }),
  setSession: (token, ttlSeconds) =>
    set({ token, expiresAt: Date.now() + ttlSeconds * 1000, promptOpen: false }),
  clear: () => set({ token: null, expiresAt: null }),
}));

/** A still-valid token (with a 5s safety margin), or null. */
export function currentToken(): string | null {
  const s = useSession.getState();
  return s.token && s.expiresAt && s.expiresAt > Date.now() + 5000 ? s.token : null;
}

let waiters: Array<(token: string | null) => void> = [];

/** Resolve with a valid session token, prompting Turnstile if needed. */
export function ensureSession(): Promise<string> {
  const existing = currentToken();
  if (existing) return Promise.resolve(existing);
  useSession.getState().openPrompt();
  return new Promise<string>((resolve, reject) => {
    waiters.push((token) => (token ? resolve(token) : reject(new Error('anulowano'))));
  });
}

/** Called by the Turnstile dialog after a successful /api/verify. */
export function resolveSession(token: string, ttlSeconds: number): void {
  useSession.getState().setSession(token, ttlSeconds);
  const pending = waiters;
  waiters = [];
  for (const w of pending) w(token);
}

/** Called when the user closes the Turnstile dialog without verifying. */
export function cancelSession(): void {
  useSession.getState().closePrompt();
  const pending = waiters;
  waiters = [];
  for (const w of pending) w(null);
}
