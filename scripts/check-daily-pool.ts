/**
 * `pnpm daily:check` — verify the daily-challenge opponent pool against the LIVE
 * OpenRouter catalog (SPEC §12.6).
 *
 * Free `:free` model ids get retired without notice — we already lost
 * `mistralai/mistral-7b-instruct:free` and both meta-llama entries. The server
 * now checks the live catalog itself and picks around dead entries
 * (providers/openrouter-pool + dailyChallenge's deadOpponentIds), so a rotten
 * id no longer kills the day for players — but it still shrinks the pool and
 * still deserves replacing. This script is how you find out first.
 *
 * Exits non-zero when any OpenRouter entry is gone, so CI/cron can shout.
 * Never needs a key: /models is public.
 */
import {
  DAILY_OPPONENTS,
  dailyChallenge,
  paidEquivalent,
  toDayString,
} from '../packages/game-core/src/daily';

const DAYS_AHEAD = 30;

const res = await fetch('https://openrouter.ai/api/v1/models');
if (!res.ok) {
  console.error(`OpenRouter /models → ${res.status}`);
  process.exit(2);
}
const catalog = (await res.json()).data ?? [];
const byId = new Map(catalog.map((m) => [m.id, m]));

const playable = (m) => {
  const out = m.architecture?.output_modalities;
  return !Array.isArray(out) || out.length === 0 || (out.length === 1 && out[0] === 'text');
};

console.log(`Katalog OpenRouter: ${catalog.length} modeli\n`);
console.log('=== PULA PRZECIWNIKÓW ===');

let dead = 0;
for (const opp of DAILY_OPPONENTS) {
  if (opp.provider !== 'openrouter') {
    console.log(`  OK    ${opp.provider}:${opp.id}  (pinned MLC build — nie gnije)`);
    continue;
  }
  const m = byId.get(opp.id);
  if (!m) {
    dead += 1;
    console.log(`  MARTWY ${opp.id}  ← nie ma go już w katalogu`);
  } else if (!playable(m)) {
    dead += 1;
    console.log(`  ZŁY   ${opp.id}  ← nie odpowiada czystym tekstem`);
  } else {
    const free =
      Number(m.pricing?.prompt ?? 0) === 0 && Number(m.pricing?.completion ?? 0) === 0;
    console.log(`  OK    ${opp.id}${free ? '' : '  ← UWAGA: JUŻ NIE JEST DARMOWY'}`);
    if (!free) dead += 1;
  }
  // The paid twin is the player's escape hatch from free-tier 429s. Its absence
  // doesn't kill the day (the free entry still works), so it's informational.
  const paid = paidEquivalent(opp);
  if (paid) {
    console.log(
      byId.has(paid.id)
        ? `        twin OK    ${paid.id}`
        : `        twin BRAK  ${paid.id}  ← bez ratunku przy 429`,
    );
  }
}

// Which of the next 30 days hit a dead entry — and what the server serves
// instead (it derives the challenge with the dead set excluded, routes/daily.ts).
const deadIds = new Set(
  DAILY_OPPONENTS.filter((o) => o.provider === 'openrouter' && !byId.has(o.id)).map((o) => o.id),
);
const today = new Date();
const swapped = [];
for (let i = 0; i < DAYS_AHEAD; i++) {
  const day = toDayString(new Date(today.getTime() + i * 86_400_000));
  const raw = dailyChallenge(day);
  if (raw.opponent.provider === 'openrouter' && deadIds.has(raw.opponent.id)) {
    const served = dailyChallenge(day, { deadOpponentIds: deadIds });
    swapped.push(`${day}: ${raw.opponent.id} → serwer poda ${served.opponent.id}`);
  }
}

console.log(`\n=== NAJBLIŻSZE ${DAYS_AHEAD} DNI ===`);
if (swapped.length === 0) {
  console.log('  Wszystkie wyzwania rozgrywalne bez podmiany.');
} else {
  console.log(`  ${swapped.length} dni trafia na martwy wpis (serwer podmienia automatycznie):`);
  swapped.forEach((b) => console.log(`    ${b}`));
}

if (dead > 0) {
  console.error(
    `\nFAIL: ${dead} wpis(ów) w puli do wymiany — popraw DAILY_OPPONENTS w packages/game-core/src/daily.ts`,
  );
  process.exit(1);
}
console.log('\nOK: cała pula żywa i darmowa.');
