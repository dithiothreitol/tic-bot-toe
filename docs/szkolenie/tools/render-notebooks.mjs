/**
 * Render zeszytow PDF (Etapy 1-4).
 * Markdown (docs/szkolenie/zeszyt-N.md) -> HTML (wlasny konwerter, podzbior MD)
 * -> PDF A4 przez Chromium/Playwright. Jasny, czytelny motyw druku z akcentami brandu.
 *
 *   node docs/szkolenie/tools/render-notebooks.mjs           # wszystkie
 *   node docs/szkolenie/tools/render-notebooks.mjs 1 3        # wybrane numery
 *   PREVIEW=1 node docs/szkolenie/tools/render-notebooks.mjs 1   # + podglad PNG gornej czesci
 *
 * Obslugiwana skladnia: # ## ###, akapity, - listy, 1. listy, | tabele |,
 * > cytat, ``` kod ```, `kod`, **pogrubienie**, *kursywa*, [link](url), ---,
 * "<!-- break -->" (nowa strona), oraz bloki ":::typ ... :::"
 * (typy: checkpoint, prompt, warn, note, cover).
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
mkdirSync(join(ROOT, 'zeszyty'), { recursive: true });

const NOTEBOOKS = [
  { n: 1, file: 'zeszyt-1-agenci-od-zera.md', title: 'Zeszyt 1 - Agenci kodujacy od zera' },
  { n: 2, file: 'zeszyt-2-case-study.md', title: 'Zeszyt 2 - Case study: tic-bot-toe w 6 dni' },
  { n: 3, file: 'zeszyt-3-srodowisko.md', title: 'Zeszyt 3 - Przygotuj srodowisko krok po kroku' },
  { n: 4, file: 'zeszyt-4-pierwsza-aplikacja.md', title: 'Zeszyt 4 - Twoja pierwsza aplikacja z agentem' },
];

// ---------- mini-konwerter Markdown -> HTML ----------
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(text) {
  const codes = [];
  let t = esc(text);
  // Sentinel @@C<n>@@ nie koliduje z normalnym tekstem (np. "6 dni").
  t = t.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '@@C' + (codes.length - 1) + '@@'; });
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, a, b) => `<a href="${b}">${a}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  t = t.replace(/@@C(\d+)@@/g, (_, i) => `<code>${codes[+i]}</code>`);
  return t;
}

function tableHtml(rows) {
  const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  const head = cells(rows[0]);
  const body = rows.slice(2).map(cells);
  let h = '<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>';
  for (const r of body) h += '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
  return h + '</tbody></table>';
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  let html = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') { i++; continue; }

    if (line.trim() === '<!-- break -->') { html += '<div class="pagebreak"></div>'; i++; continue; }

    const cb = line.match(/^:::(\w+)\s*$/);
    if (cb) {
      const type = cb[1]; const buf = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') { buf.push(lines[i]); i++; }
      i++;
      if (type === 'cover') {
        html += `<section class="cover">${mdToHtml(buf.join('\n'))}</section>`;
      } else {
        const label = { checkpoint: 'OK - Punkt kontrolny', prompt: 'Skopiuj do agenta', warn: 'Uwaga', note: 'Wskazowka' }[type] || '';
        html += `<div class="callout ${type}">${label ? `<div class="callout-h">${label}</div>` : ''}${mdToHtml(buf.join('\n'))}</div>`;
      }
      continue;
    }

    if (line.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      html += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { const lvl = h[1].length; html += `<h${lvl}>${inline(h[2])}</h${lvl}>`; i++; continue; }

    if (line.trim() === '---') { html += '<hr>'; i++; continue; }

    if (line.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|?$/.test(lines[i + 1].trim())) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('|')) { buf.push(lines[i]); i++; }
      html += tableHtml(buf);
      continue;
    }

    if (line.startsWith('> ')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      html += `<blockquote>${mdToHtml(buf.join('\n'))}</blockquote>`;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      let out = '<ol>';
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { out += `<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`; i++; }
      html += out + '</ol>';
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      let out = '<ul>';
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { out += `<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`; i++; }
      html += out + '</ul>';
      continue;
    }

    const buf = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s|\||```|:::)/.test(lines[i]) && lines[i].trim() !== '---' && lines[i].trim() !== '<!-- break -->') {
      buf.push(lines[i]); i++;
    }
    if (buf.length) html += `<p>${inline(buf.join(' '))}</p>`;
  }
  return html;
}

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@600;700&family=JetBrains+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap');
  :root{
    --ink:#111826; --soft:#3F4A5C; --faint:#6B7688; --line:#E2E7EF;
    --cyan:#0E7C8B; --magenta:#C0287A; --lime:#4F7A12; --bg-code:#F4F6FA;
  }
  *{box-sizing:border-box;}
  body{margin:0;color:var(--ink);font-family:'Inter',system-ui,sans-serif;font-size:11.2pt;line-height:1.55;}
  h1,h2,h3,h4{font-family:'Rajdhani',sans-serif;line-height:1.12;color:#0B1220;letter-spacing:-.01em;}
  h1{font-size:26pt;margin:0 0 6pt;}
  h2{font-size:18pt;margin:22pt 0 8pt;padding-top:8pt;border-top:2px solid var(--line);}
  h3{font-size:13.5pt;margin:16pt 0 5pt;color:var(--cyan);}
  h4{font-size:11.5pt;margin:12pt 0 4pt;text-transform:uppercase;letter-spacing:.06em;color:var(--soft);font-family:'JetBrains Mono',monospace;}
  p{margin:0 0 8pt;}
  a{color:var(--cyan);text-decoration:none;border-bottom:1px solid rgba(14,124,139,.35);}
  strong{color:#0B1220;} em{color:var(--soft);}
  code{font-family:'JetBrains Mono',monospace;font-size:.86em;background:var(--bg-code);padding:1px 5px;border-radius:3px;color:var(--magenta);}
  pre{background:#0B1220;color:#DCE6F5;padding:14pt 16pt;border-radius:6px;overflow:auto;margin:10pt 0;}
  pre code{background:none;color:inherit;padding:0;font-size:9.5pt;line-height:1.5;}
  ul,ol{margin:0 0 8pt;padding-left:20pt;} li{margin:3pt 0;}
  hr{border:none;border-top:1px solid var(--line);margin:14pt 0;}
  blockquote{margin:10pt 0;padding:2pt 0 2pt 16pt;border-left:3px solid var(--faint);color:var(--soft);font-style:italic;}
  table{border-collapse:collapse;width:100%;margin:10pt 0;font-size:10pt;}
  th,td{border:1px solid var(--line);padding:6pt 9pt;text-align:left;vertical-align:top;}
  th{background:#F4F6FA;font-family:'Rajdhani',sans-serif;font-size:11pt;color:#0B1220;}
  .pagebreak{break-after:page;}
  .callout{margin:12pt 0;padding:12pt 16pt;border-radius:6px;border:1px solid var(--line);page-break-inside:avoid;}
  .callout-h{font-family:'JetBrains Mono',monospace;font-size:9.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6pt;}
  .callout p:last-child{margin-bottom:0;}
  .callout.checkpoint{background:#F3FAE9;border-color:#CDE6A6;} .callout.checkpoint .callout-h{color:var(--lime);}
  .callout.prompt{background:#0B1220;border-color:#0B1220;color:#DCE6F5;}
  .callout.prompt .callout-h{color:#35E7FF;} .callout.prompt code{background:rgba(255,255,255,.1);color:#8CE9F5;}
  .callout.prompt strong{color:#fff;}
  .callout.warn{background:#FFF6EC;border-color:#F4D3A6;} .callout.warn .callout-h{color:#B4600A;}
  .callout.note{background:#EEF6FF;border-color:#BFDCF5;} .callout.note .callout-h{color:var(--cyan);}
  .cover{height:247mm;display:flex;flex-direction:column;justify-content:center;break-after:page;}
  .cover h1{font-size:40pt;line-height:1;margin-bottom:14pt;}
  .cover h1 + p{font-size:15pt;color:var(--soft);max-width:150mm;}
  .cover hr{width:70mm;border-top:4px solid var(--cyan);margin:0 0 22pt;}
  .cover .meta{margin-top:auto;font-family:'JetBrains Mono',monospace;font-size:9.5pt;color:var(--faint);}
`;

function pageHtml(bodyHtml) {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>${CSS}</style></head><body>${bodyHtml}</body></html>`;
}

const want = process.argv.slice(2).map(Number).filter(Boolean);
const list = want.length ? NOTEBOOKS.filter((b) => want.includes(b.n)) : NOTEBOOKS;

const browser = await chromium.launch();
for (const nb of list) {
  const src = join(ROOT, nb.file);
  if (!existsSync(src)) { console.log(`POMIN  ${nb.file} (brak)`); continue; }
  const md = readFileSync(src, 'utf8');
  const p = await browser.newPage();
  await p.setContent(pageHtml(mdToHtml(md)), { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  if (process.env.PREVIEW) {
    await p.setViewportSize({ width: 900, height: 1300 });
    await p.screenshot({ path: join(ROOT, 'zeszyty', '_preview-' + nb.n + '.png') });
  }
  const out = join(ROOT, 'zeszyty', nb.file.replace(/\.md$/, '.pdf'));
  await p.pdf({
    path: out, format: 'A4', printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `<div style="width:100%;font-family:'JetBrains Mono',monospace;color:#9AA4B4;padding:0 18mm;"><div style="display:flex;justify-content:space-between;font-size:7pt;"><span>${nb.title}</span><span>str. <span class="pageNumber"></span> / <span class="totalPages"></span></span></div><div style="text-align:center;font-size:6.5pt;color:#AEB6C2;margin-top:2px;">Treść wygenerowana przez AI (Claude) &middot; moderacja: Dariusz Tyszka</div></div>`,
  });
  await p.close();
  console.log(`PDF   zeszyty/${nb.file.replace(/\.md$/, '.pdf')}`);
}
await browser.close();
console.log('\nGotowe -> docs/szkolenie/zeszyty/');
