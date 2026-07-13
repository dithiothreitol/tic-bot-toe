import { OpenRouterKeyHelp } from '@/components/OpenRouterKeyHelp';
import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';

/**
 * Quick-start strip under the setup card: four steps to a first match, plus the
 * "dlaczego to działa" callout from screen 01. The artwork is decorative only —
 * every step is fully readable from the text alone (images are aria-hidden).
 */
const STEP_ART = [
  '/quickstart-1.webp',
  '/quickstart-2.webp',
  '/quickstart-3.webp',
  '/quickstart-4.webp',
];

export function QuickStartSection() {
  const t = useT();
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>{t.quickStart.kicker}</SectionLabel>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.quickStart.steps.map((step, i) => (
          <HudPanel key={step.title} className="flex flex-col gap-2 overflow-hidden p-3">
            {/* Full-bleed header art: pull it out of the panel padding so the
                graphic fills the whole top edge-to-edge, and cover (not contain)
                so there's no letterboxing around it. */}
            <img
              src={STEP_ART[i]}
              alt=""
              aria-hidden
              loading="lazy"
              width={1000}
              height={400}
              className="-mx-3 -mt-3 mb-1 h-28 w-[calc(100%+1.5rem)] max-w-none border-b border-border-soft bg-card-inset object-cover"
            />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px] text-p1">{`0${i + 1}`}</span>
              <h3 className="font-sans text-sm font-semibold uppercase tracking-[0.06em]">
                {step.title}
              </h3>
            </div>
            <p className="text-xs text-muted-foreground">{step.desc}</p>
          </HudPanel>
        ))}
      </div>

      <OpenRouterKeyHelp />

      {/* A real recorded match (scripts/gen/record-match.ts) — muted, looping and
          inert, so it never competes with the page for attention or bandwidth. */}
      <HudPanel scanner className="flex flex-col gap-3 p-4">
        <SectionLabel>{t.quickStart.watch.title}</SectionLabel>
        <p className="max-w-prose text-xs text-muted-foreground">{t.quickStart.watch.lead}</p>
        <video
          src="/match.webm"
          poster="/match-poster.webp"
          autoPlay
          loop
          muted
          playsInline
          preload="none"
          aria-label={t.quickStart.watch.title}
          className="clip-tab w-full border border-border-soft bg-card-inset"
        />
      </HudPanel>

      <HudPanel
        brackets
        accent="edu"
        className="flex flex-col items-center gap-4 p-4 sm:flex-row"
      >
        <img
          src="/section-edu.webp"
          alt=""
          aria-hidden
          loading="lazy"
          width={1200}
          height={600}
          className="h-24 w-full shrink-0 object-contain sm:w-56"
        />
        <div className="flex flex-col gap-2">
          <SectionLabel>{t.quickStart.why.title}</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {t.quickStart.why.points.map((point) => (
              <li key={point} className="flex gap-2 text-xs text-muted-foreground">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 bg-edu" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </HudPanel>
    </section>
  );
}
