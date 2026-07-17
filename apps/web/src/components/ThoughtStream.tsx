import { useEffect, useRef } from 'react';

import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

interface ThoughtStreamProps {
  /** The reasoning trace to show — null/empty renders the waiting/empty state. */
  thought?: string | null;
  /** Header context: whose trace and which move (1-indexed). */
  modelName?: string;
  moveNumber?: number | null;
  /** `live` adds the HUD scanner line (a running match); replays stay calm. */
  live?: boolean;
  className?: string;
}

/**
 * „Tok myślenia" panel (Module A, plan §3.2/§3.3): the model's own reasoning
 * trace for the current move, shared by the live game and the replay. Plain text
 * only — the trace was capped at capture and is the model's words, quoted, never
 * markup. Auto-scrolls to the newest content. (The char-by-char typewriter is the
 * streaming variant — plan §3.4, Etap 10.)
 */
export function ThoughtStream({
  thought,
  modelName,
  moveNumber,
  live = false,
  className,
}: ThoughtStreamProps) {
  const t = useT();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Keep the freshest reasoning in view as it changes move to move.
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [thought]);

  return (
    <HudPanel scanner={live} className={cn('flex flex-col gap-2 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{t.thoughts.title}</SectionLabel>
        {modelName && moveNumber != null && (
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-dim">
            {modelName.slice(0, 20)} · #{moveNumber}
          </span>
        )}
      </div>
      <div ref={bodyRef} className="max-h-52 overflow-y-auto">
        {thought ? (
          <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-muted-foreground">
            {thought}
          </p>
        ) : (
          <p className="font-mono text-xs text-dim">
            {live ? t.thoughts.waiting : t.thoughts.none}
          </p>
        )}
      </div>
    </HudPanel>
  );
}
