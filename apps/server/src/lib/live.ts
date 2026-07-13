/**
 * In-memory registry of matches currently being played — the data behind the
 * home-page "live" counter.
 *
 * Matches run entirely in the browser (SPEC §3), so the server only ever hears
 * about them at start (a match-start token) and at the end (a saved result) —
 * there is no server-side game loop to count. This registry is fed instead by a
 * lightweight client heartbeat: a playing tab pings every few seconds, and an
 * entry lives only until its TTL lapses. "In progress" therefore means "a
 * browser said it was playing within the last {@link LIVE_TTL_MS} ms" — closing
 * the tab makes the count fall on its own, no disconnect signal required.
 *
 * Single-process, exactly like the rate limiter (see middleware/rate-limit) —
 * fine for the one-VPS deploy. It resets on restart and simply repopulates
 * within one heartbeat interval. The numbers are a soft, public vanity stat, not
 * a security boundary, so the guards below aim only at bounding memory, not at
 * making the count un-gameable.
 */

/** Match modes as stored on `matches.mode` (SPEC §13). */
export type LiveMode = 'model_vs_model' | 'human_vs_model';

export const LIVE_MODES: readonly LiveMode[] = ['model_vs_model', 'human_vs_model'];

export interface LiveCounts {
  model_vs_model: number;
  human_vs_model: number;
  total: number;
}

/** How long a heartbeat keeps a match "alive". Client beats well inside this. */
export const LIVE_TTL_MS = 60_000;

/**
 * Hard ceiling on tracked entries. A client picks its own id, so a flood of
 * random ids could otherwise grow the map without bound before TTLs catch up.
 * Past the cap we prune expired entries and, if still full, drop the ping — the
 * counter under-reports rather than eating memory.
 */
const MAX_ENTRIES = 20_000;

interface Entry {
  mode: LiveMode;
  expiresAt: number;
}

export class LiveRegistry {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly ttlMs: number = LIVE_TTL_MS) {}

  /**
   * Record (or refresh) a playing tab. `id` is an opaque, client-chosen match id
   * — no identity, nothing kept past its TTL. A repeat ping just extends the
   * expiry, so a continuous match stays counted as one.
   */
  ping(id: string, mode: LiveMode, now: number): void {
    if (!this.entries.has(id) && this.entries.size >= MAX_ENTRIES) {
      this.prune(now);
      if (this.entries.size >= MAX_ENTRIES) return; // still full — shed the ping
    }
    this.entries.set(id, { mode, expiresAt: now + this.ttlMs });
  }

  /** Best-effort "match ended": drop the entry so the count falls immediately. */
  drop(id: string): void {
    this.entries.delete(id);
  }

  /** Live counts, dropping anything past its TTL along the way. */
  counts(now: number): LiveCounts {
    this.prune(now);
    let modelVsModel = 0;
    let humanVsModel = 0;
    for (const entry of this.entries.values()) {
      if (entry.mode === 'model_vs_model') modelVsModel += 1;
      else humanVsModel += 1;
    }
    return {
      model_vs_model: modelVsModel,
      human_vs_model: humanVsModel,
      total: modelVsModel + humanVsModel,
    };
  }

  private prune(now: number): void {
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(id);
    }
  }
}
