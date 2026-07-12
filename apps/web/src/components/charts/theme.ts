/**
 * Recharts needs literal color strings, so mirror the DESIGN §2/§5 tokens here.
 * Keep in sync with apps/web/src/index.css.
 */
export const chartTheme = {
  p1: '#35e7ff',
  p2: '#ff3d9a',
  edu: '#b6ff3c',
  warn: '#ff8a3c',
  danger: '#ff4d6a',
  grid: 'rgba(53,231,255,0.10)',
  axis: '#8590ad',
  text: '#a4adc7',
  surface: '#080d18',
} as const;

/** P1=cyan, P2=magenta; other providers (WebLLM/Ollama) share the edu lime. */
export function subjectColor(subjectId: string, fallback: string = chartTheme.p1): string {
  if (subjectId.startsWith('webllm:') || subjectId.startsWith('ollama:')) return chartTheme.edu;
  return fallback;
}

/** Strip the provider prefix for compact chart labels. */
export function shortSubject(id: string): string {
  return id.replace(/^(openrouter|webllm|ollama):/, '');
}
