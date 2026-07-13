import { useT } from '@/i18n';
import { useModelLoad } from '@/store/model-load';

export function ModelLoadBar() {
  const t = useT();
  const active = useModelLoad((s) => s.active);
  const progress = useModelLoad((s) => s.progress);
  const text = useModelLoad((s) => s.text);
  if (!active) return null;

  const pct = Math.round(progress * 100);
  return (
    <div className="w-full max-w-md rounded-lg border bg-card/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{t.modelLoad.downloading}</span>
        <span className="font-mono text-p1">{pct}%</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-p1 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {text && (
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{text}</p>
      )}
    </div>
  );
}
