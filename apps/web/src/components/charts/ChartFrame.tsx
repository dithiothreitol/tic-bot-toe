import { Download } from 'lucide-react';
import * as React from 'react';

import { HudPanel, SectionLabel } from '@/components/ui/hud';
import { useT } from '@/i18n';
import { exportChartPng } from '@/lib/chart-export';
import { cn } from '@/lib/utils';

interface ChartFrameProps {
  title: string;
  /** "▸ co z tego wynika: …" takeaway under the chart (DESIGN §5, edu lime). */
  takeaway?: React.ReactNode;
  empty?: boolean;
  emptyText?: string;
  /** Filename (without .png) — enables the PNG export button. */
  exportName?: string;
  /** Chart body min-height in px. */
  height?: number;
  /** Right-of-title slot (legend, toggle). */
  action?: React.ReactNode;
  brackets?: boolean;
  scanner?: boolean;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Shared HUD wrapper for every §9 chart: titled panel, PNG export, empty state,
 * and a one-line "what this means" takeaway (SPEC §9.3 requires all three).
 */
export function ChartFrame({
  title,
  takeaway,
  empty = false,
  emptyText,
  exportName,
  height = 240,
  action,
  brackets = false,
  scanner = false,
  className,
  children,
}: ChartFrameProps) {
  const t = useT();
  const bodyRef = React.useRef<HTMLDivElement>(null);

  return (
    <HudPanel brackets={brackets} scanner={scanner} className={cn('flex flex-col gap-3 p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <SectionLabel>{title}</SectionLabel>
        <div className="flex items-center gap-2">
          {action}
          {exportName && !empty && (
            <button
              type="button"
              onClick={() => void exportChartPng(bodyRef.current, exportName)}
              aria-label={t.charts.exportPng}
              title={t.charts.exportPng}
              className="clip-cut flex items-center gap-1 border border-border bg-card/60 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-dim transition-colors hover:text-p1"
            >
              <Download className="size-3" />
              PNG
            </button>
          )}
        </div>
      </div>

      {empty ? (
        <div
          className="flex flex-col items-center justify-center gap-3 text-center font-mono text-xs text-dim"
          style={{ minHeight: height }}
        >
          <img
            src="/empty-state.webp"
            alt=""
            aria-hidden
            loading="lazy"
            width={800}
            height={500}
            className="h-20 w-auto max-w-full object-contain opacity-70"
          />
          {emptyText ?? t.charts.empty}
        </div>
      ) : (
        <div ref={bodyRef} style={{ width: '100%', height }}>
          {children}
        </div>
      )}

      {takeaway && !empty && (
        <p className="text-xs text-edu">
          <span className="font-mono">▸ </span>
          {takeaway}
        </p>
      )}
    </HudPanel>
  );
}
