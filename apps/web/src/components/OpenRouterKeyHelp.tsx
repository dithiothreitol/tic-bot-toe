import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * Why an OpenRouter key is needed and where to get one. Rendered both in the
 * settings dialog (where the key is pasted) and in the quick-start strip (where
 * a first-time player reads about players) — one component, so the two places
 * can never drift apart. Only the last step differs: `withField` means the key
 * input is right above, so "paste it there" beats "go to settings".
 */
export function OpenRouterKeyHelp({
  className,
  withField = false,
}: {
  className?: string;
  withField?: boolean;
}) {
  const copy = useT().keyHelp;
  const steps = [...copy.steps, withField ? copy.lastStepHere : copy.lastStepSettings];

  return (
    <HudPanel className={cn('flex flex-col gap-3 p-3', className)}>
      <SectionLabel>{copy.title}</SectionLabel>
      <p className="text-xs text-muted-foreground">{copy.why}</p>

      <div className="flex flex-col gap-2">
        <SectionLabel>{copy.howTitle}</SectionLabel>
        <ol className="flex flex-col gap-1.5">
          {steps.map((step, i) => (
            <li key={step} className="flex gap-2 text-xs text-muted-foreground">
              <span aria-hidden className="font-mono text-[11px] text-p1">{`0${i + 1}`}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-xs text-muted-foreground">{copy.cost}</p>

      <a
        href={copy.href}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-p1 underline-offset-2 hover:underline"
      >
        {copy.cta} ↗
      </a>
    </HudPanel>
  );
}
