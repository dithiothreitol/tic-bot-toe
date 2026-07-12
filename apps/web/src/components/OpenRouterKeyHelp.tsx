import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { pl } from '@/i18n/pl';
import { cn } from '@/lib/utils';

/**
 * Why an OpenRouter key is needed and where to get one. Rendered both in the
 * settings dialog (where the key is pasted) and in the quick-start strip (where
 * a first-time player reads about players) — one component, so the two places
 * can never drift apart.
 */
export function OpenRouterKeyHelp({ className }: { className?: string }) {
  const t = pl.keyHelp;

  return (
    <HudPanel className={cn('flex flex-col gap-3 p-3', className)}>
      <SectionLabel>{t.title}</SectionLabel>
      <p className="text-xs text-muted-foreground">{t.why}</p>

      <div className="flex flex-col gap-2">
        <SectionLabel>{t.howTitle}</SectionLabel>
        <ol className="flex flex-col gap-1.5">
          {t.steps.map((step, i) => (
            <li key={step} className="flex gap-2 text-xs text-muted-foreground">
              <span aria-hidden className="font-mono text-[11px] text-p1">{`0${i + 1}`}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-muted-foreground">{t.cost}</p>

      <a
        href={t.href}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-p1 underline-offset-2 hover:underline"
      >
        {t.cta} ↗
      </a>
    </HudPanel>
  );
}
