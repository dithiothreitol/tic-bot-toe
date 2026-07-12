import { type PlayerProfile, apiDelete, apiGet, apiPost } from '@/api/client';
import { getPlayerToken } from '@/store/settings';

/**
 * Player profile calls (SPEC §10). Identity travels as the `X-Player-Token`
 * bearer secret; there is no account and no PII. The server owns the nickname
 * (uniqueness + profanity filter), so it is the source of truth for the board.
 */
export function fetchProfile(): Promise<PlayerProfile> {
  return apiGet<PlayerProfile>('/api/player/me', { playerToken: getPlayerToken() });
}

export function saveNickname(nickname: string): Promise<PlayerProfile> {
  return apiPost<PlayerProfile>(
    '/api/player/nickname',
    { nickname },
    { playerToken: getPlayerToken() },
  );
}

export function removeNickname(): Promise<PlayerProfile> {
  return apiDelete<PlayerProfile>('/api/player/nickname', { playerToken: getPlayerToken() });
}
