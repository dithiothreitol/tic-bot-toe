/**
 * `pnpm daily:check` — verify the daily-challenge opponent pool against the LIVE
 * OpenRouter catalog (SPEC §12.6).
 *
 * Free `:free` model ids get retired without notice — we already lost
 * `mistralai/mistral-7b-instruct:free`. A retired id doesn't crash anything: the
 * runner just forfeits random moves, so the "opponent" plays like a ghost. The
 * server refuses to complete such a challenge (`opponent_never_played`) and the
 * UI hides it, but that only means the challenge is DEAD for that day — someone
 * still has to fix the pool. This script is how you find out first.
 *
 * Exits non-zero when any OpenRouter entry is gone, so CI/cron can shout.
 * Never needs a key: /models is public.
 */
import { DAILY_OPPONENTS, dailyChallenge, toDayString } from '../packages/game-core/src/daily';

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
}

// Which of the next 30 days would actually be broken?
const today = new Date();
const broken = [];
for (let i = 0; i < DAYS_AHEAD; i++) {
  const day = toDayString(new Date(today.getTime() + i * 86_400_000));
  const c = dailyChallenge(day);
  if (c.opponent.provider === 'openrouter' && !byId.has(c.opponent.id)) {
    broken.push(`${day} → ${c.opponent.id}`);
  }
}

console.log(`\n=== NAJBLIŻSZE ${DAYS_AHEAD} DNI ===`);
if (broken.length === 0) {
  console.log('  Wszystkie wyzwania rozgrywalne.');
} else {
  console.log(`  ${broken.length} dni z martwym przeciwnikiem:`);
  broken.forEach((b) => console.log(`    ${b}`));
}

if (dead > 0) {
  console.error(
    `\nFAIL: ${dead} wpis(ów) w puli do wymiany — popraw DAILY_OPPONENTS w packages/game-core/src/daily.ts`,
  );
  process.exit(1);
}
console.log('\nOK: cała pula żywa i darmowa.');
