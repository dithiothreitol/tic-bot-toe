import type { GameId } from '@arena/game-core';
import type { Locale } from '@arena/i18n';

import { apiGet } from '@/api/client';

/** Certificate for a won daily challenge (§12.6). Public — no player token. */

export interface CertificateFacts {
  matchId: string;
  day: string;
  playerName: string | null;
  opponentId: string;
  opponentLabel: string;
  game: GameId;
  variant: string;
  streak: number;
  moveCount: number;
  movesHashPrefix: string;
  hasBoard: boolean;
  tier: 'none' | 'enthusiast' | 'lead' | 'head' | 'chief';
  url: string;
}

export function fetchCertificate(matchId: string): Promise<CertificateFacts> {
  return apiGet<CertificateFacts>(`/api/certificate/${matchId}`);
}

/**
 * The PDF is a plain link, not a fetch+Blob: the browser then shows its own
 * download UI and writes the file straight to disk, with no JS in the path.
 */
export function certificatePdfUrl(matchId: string, locale: Locale): string {
  return `/api/certificate/${matchId}.pdf?lang=${locale}`;
}

/** The 1200×630 social card — also what the page shows as a preview. */
export function certificateCardUrl(matchId: string, locale: Locale): string {
  return `/api/certificate/${matchId}.jpg?lang=${locale}`;
}
