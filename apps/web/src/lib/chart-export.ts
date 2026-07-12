/**
 * Export a chart to PNG (SPEC §9.3: "eksport PNG"). Recharts renders inline SVG;
 * we serialize it, rasterize onto a canvas with the HUD background, and download.
 * Best-effort and fully client-side — no server round-trip.
 */
export async function exportChartPng(
  container: HTMLElement | null,
  filename: string,
  background = '#080d18',
): Promise<void> {
  const svg = container?.querySelector('svg');
  if (!svg) return;

  const rect = svg.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));

  const xml = new XMLSerializer().serializeToString(clone);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  img.width = width;
  img.height = height;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('svg load failed'));
    img.src = svgUrl;
  });

  const scale = 2; // retina export
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.png') ? filename : `${filename}.png`;
  a.click();
}
