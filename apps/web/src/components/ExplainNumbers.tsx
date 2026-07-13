import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/**
 * „Jak czytać te liczby?" (SPEC §12.3) — the hand-written educational section,
 * linked from the leaderboard and every model card. Content lives in i18n/t.ts;
 * this is only the shell. Collapsed by default so it never buries the data.
 */
export function ExplainNumbers({
  className,
  defaultOpen = false,
}: {
  className?: string;
  defaultOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <HudPanel
      brackets
      accent="edu"
      id="jak-czytac-te-liczby"
      className={cn('flex flex-col gap-3 p-5', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionLabel className="text-edu">{t.explain.title}</SectionLabel>
          <p className="text-sm text-muted-foreground">{t.explain.lead}</p>
        </div>
        <Button variant="edu" size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? '−' : '+'}
        </Button>
      </div>

      {open && (
        <dl className="flex flex-col gap-4 pt-2">
          {t.explain.entries.map((e) => (
            <div key={e.q} className="flex flex-col gap-1 border-l-2 border-edu/40 pl-3">
              <dt className="font-sans text-sm font-bold uppercase tracking-wide text-edu">
                {e.q}
              </dt>
              <dd className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {e.a}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </HudPanel>
  );
}
