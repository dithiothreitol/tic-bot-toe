import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';
import { fetchProfile, removeNickname, saveNickname } from '@/api/player';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionLabel } from '@/components/ui/hud';
import { pl } from '@/i18n/pl';
import { isValidPlayerToken } from '@/lib/id';
import { useSettings } from '@/store/settings';

/** Map a server rejection to a Polish message. */
function nicknameError(e: unknown): string {
  const code = e instanceof ApiError ? e.message : '';
  if (code === 'nickname_taken') return pl.profile.nicknameTaken;
  if (code === 'invalid_format') return pl.profile.nicknameInvalid;
  if (code === 'profanity') return pl.profile.nicknameProfanity;
  return pl.profile.saveError;
}

/**
 * Player profile (SPEC §10/§16): pseudonymous identity, no account and no PII.
 * The nickname lives on the server (uniqueness + profanity filter); the identity
 * token stays in this browser and is portable, which is the only way to keep one
 * ranking row across devices.
 */
export function PlayerProfile() {
  const playerToken = useSettings((s) => s.playerToken);
  const setPlayerToken = useSettings((s) => s.setPlayerToken);
  const nickname = useSettings((s) => s.nickname);
  const setNickname = useSettings((s) => s.setNickname);

  const [draft, setDraft] = useState(nickname ?? '');
  const [flagged, setFlagged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importCode, setImportCode] = useState('');

  // The server is the source of truth for the nickname shown in the ranking.
  useEffect(() => {
    let alive = true;
    fetchProfile()
      .then((p) => {
        if (!alive) return;
        setNickname(p.nickname);
        setDraft(p.nickname ?? '');
        setFlagged(p.flagged);
      })
      .catch(() => {
        /* offline or not reachable — keep the local mirror */
      });
    return () => {
      alive = false;
    };
  }, [playerToken, setNickname]);

  const save = async () => {
    setBusy(true);
    try {
      const p = await saveNickname(draft);
      setNickname(p.nickname);
      setDraft(p.nickname ?? '');
      toast.success(pl.profile.nicknameSaved);
    } catch (e) {
      toast.error(nicknameError(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await removeNickname();
      setNickname(null);
      setDraft('');
      toast.success(pl.profile.nicknameRemoved);
    } catch {
      toast.error(pl.profile.saveError);
    } finally {
      setBusy(false);
    }
  };

  const copyIdentity = async () => {
    try {
      await navigator.clipboard.writeText(playerToken);
      toast.success(pl.profile.identityCopied);
    } catch {
      toast.error(pl.profile.copyFailed);
    }
  };

  const importIdentity = () => {
    const code = importCode.trim();
    if (!isValidPlayerToken(code)) {
      toast.error(pl.profile.importInvalid);
      return;
    }
    if (code === playerToken) return;
    if (!window.confirm(pl.profile.importConfirm)) return;
    setPlayerToken(code);
    setImportCode('');
    toast.success(pl.profile.imported);
  };

  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>{pl.profile.title}</SectionLabel>

      {flagged && (
        <p className="border-l-2 border-warn bg-warn/5 px-2 py-1 font-mono text-xs text-warn">
          {pl.profile.flagged}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="nick">{pl.settings.nickname}</Label>
        <Input
          id="nick"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={pl.settings.nicknamePlaceholder}
          maxLength={20}
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={save} disabled={busy || !draft.trim()}>
            {pl.settings.save}
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={busy || !nickname}>
            {pl.settings.remove}
          </Button>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          {nickname ? pl.profile.nicknameHint : `${pl.profile.anonymous}. ${pl.profile.nicknameHint}`}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>{pl.profile.identity}</Label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={copyIdentity}>
            {pl.profile.copyIdentity}
          </Button>
        </div>
        <Input
          value={importCode}
          onChange={(e) => setImportCode(e.target.value)}
          placeholder={pl.profile.importPlaceholder}
          className="font-mono"
          spellCheck={false}
          autoComplete="off"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={importIdentity}
            disabled={!importCode.trim()}
          >
            {pl.profile.import}
          </Button>
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          {pl.profile.identityHint}
        </p>
      </div>

      <p className="font-mono text-[11px] leading-relaxed text-dim">{pl.profile.privacy}</p>
    </div>
  );
}
