import { Download, ExternalLink, ImageDown, Link2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import {
  type CertificateFacts,
  certificateCardUrl,
  certificatePdfUrl,
  certificatePngUrl,
  fetchCertificate,
} from '@/api/certificate';
import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useLocale, useLocalePath, useT } from '@/i18n';

/**
 * The page a shared certificate link lands on (plan §8.3).
 *
 * The preview is the SERVER-rendered card, not an HTML re-creation: one renderer
 * means the page, the social preview and the PDF cannot disagree about what the
 * certificate says.
 */
export function CertificatePage() {
  const t = useT();
  const locale = useLocale();
  const path = useLocalePath();
  const { id } = useParams<{ id: string }>();
  const [facts, setFacts] = useState<CertificateFacts | null>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound'>('loading');
  const [linkedIn, setLinkedIn] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setStatus('loading');
    fetchCertificate(id)
      .then((f) => {
        if (!alive) return;
        setFacts(f);
        setStatus('ok');
      })
      .catch(() => {
        if (alive) setStatus('notfound');
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (status === 'loading') return <Skeleton className="h-96 w-full" />;

  if (status === 'notfound' || !facts) {
    return (
      <HudPanel brackets className="flex flex-col items-start gap-3 p-6">
        <SectionLabel>{t.certificate.kicker}</SectionLabel>
        <p className="text-sm text-muted-foreground">{t.certificate.notFound}</p>
        <Button asChild variant="outline" size="sm">
          <Link to={path('arena')}>{t.certificate.backToArena}</Link>
        </Button>
      </HudPanel>
    );
  }

  const shareUrl = facts.url;
  const shareText = linkedIn
    ? t.certificate.shareTextLinkedIn(facts.opponentLabel, facts.streak)
    : t.certificate.shareText(facts.opponentLabel);

  const share = async () => {
    // LinkedIn mode is a POST to compose, so the text matters more than the
    // sheet: copy it either way, so it is on the clipboard when the app opens.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: document.title, text: shareText, url: shareUrl });
        return;
      } catch {
        // Cancelled or unsupported — fall through to the clipboard.
      }
    }
    await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
    toast.success(t.certificate.copiedText);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast.success(t.certificate.copied);
  };

  const rows: [string, string][] = [
    [t.certificate.labelOpponent, facts.opponentLabel],
    [t.certificate.labelDay, facts.day],
    [t.certificate.labelStreak, String(facts.streak)],
    [t.certificate.labelMoves, String(facts.moveCount)],
    [t.certificate.labelSeal, facts.movesHashPrefix],
  ];

  return (
    <div className="flex flex-col gap-6">
      <HudPanel brackets accent="edu" className="flex flex-col gap-5 p-5">
        <SectionLabel className="text-edu">{t.certificate.kicker}</SectionLabel>

        {/* The server-rendered card — exactly what a feed will show. */}
        <img
          src={certificateCardUrl(facts.matchId, locale)}
          alt={t.certificate.shareText(facts.opponentLabel)}
          width={1200}
          height={630}
          className="clip-cut w-full border border-border"
        />

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="edu">
              {/* A real link, so the browser owns the download. */}
              <a href={certificatePdfUrl(facts.matchId, locale)} download>
                <Download className="size-4" />
                {t.certificate.download}
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={certificatePngUrl(facts.matchId, locale)} download>
                <ImageDown className="size-4" />
                {t.certificate.downloadPng}
              </a>
            </Button>
            <Button variant="outline" onClick={() => void share()}>
              <Share2 className="size-4" />
              {t.certificate.share}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void copyLink()}>
              <Link2 className="size-4" />
              {t.certificate.copyLink}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.certificate.downloadHint}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Switch id="linkedin-mode" checked={linkedIn} onCheckedChange={setLinkedIn} />
            <Label htmlFor="linkedin-mode" className="font-mono text-[11px] uppercase tracking-wider">
              {t.certificate.linkedInMode}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">{t.certificate.linkedInHint}</p>
          {linkedIn && (
            <pre className="clip-cut mt-1 max-w-prose whitespace-pre-wrap border border-border bg-card-inset p-3 font-sans text-xs text-muted-foreground">
              {shareText}
            </pre>
          )}
        </div>

        {facts.playerName === null && (
          <p className="text-xs text-warn">{t.certificate.setNickHint}</p>
        )}
      </HudPanel>

      <HudPanel className="flex flex-col gap-3 p-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 font-mono text-xs">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-dim uppercase tracking-wider">{label}</dt>
              <dd className="truncate text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
        <a
          href={path('replay', facts.matchId)}
          className="inline-flex w-fit items-center gap-2 font-mono text-xs text-p1 underline-offset-2 hover:underline"
        >
          {t.certificate.replay}
          <ExternalLink className="size-3 opacity-60" aria-hidden />
        </a>
      </HudPanel>
    </div>
  );
}
