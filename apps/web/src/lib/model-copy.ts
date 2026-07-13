import type { Locale } from '@/i18n';

/**
 * Plain-language model descriptions (SPEC §12.3), in every UI locale.
 *
 * Generated from catalog metadata by a RULE TEMPLATE — deterministic, free, and
 * offline. Explicitly NOT written by an LLM: the whole point of the model card
 * is to explain models to a layman, and an LLM-written blurb would cost money,
 * vary between reloads, and could hallucinate facts about the model.
 *
 * Inputs are only what the OpenRouter catalog gives us (size hints in the id,
 * price, context window) plus the provider. The CLASSIFICATION (size / price /
 * context class) is language-free and shared — only the sentences differ per
 * locale, so a translation can never move a model into a different bucket.
 */

export interface ModelMeta {
  provider: 'openrouter' | 'webllm' | 'ollama';
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number | null;
  /** USD per token. */
  price?: { prompt: number; completion: number };
}

export type SizeClass = 'small' | 'medium' | 'large' | 'unknown';
export type PriceClass = 'free' | 'cheap' | 'moderate' | 'expensive' | 'unknown';
export type ContextClass = 'short' | 'standard' | 'long' | 'unknown';

export interface ModelCopy {
  headline: string;
  sentences: string[];
  tags: string[];
  size: SizeClass;
  priceClass: PriceClass;
  contextClass: ContextClass;
}

/** Parameter count in billions, parsed from ids like "llama-3.1-8b-instruct". */
function paramsB(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*b(?![a-z0-9])/i.exec(text);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function sizeClassOf(meta: ModelMeta): SizeClass {
  // WebLLM only ships small in-browser models.
  if (meta.provider === 'webllm') return 'small';
  const text = `${meta.id} ${meta.name}`;
  const b = paramsB(text);
  if (b !== null) {
    if (b < 8) return 'small';
    if (b <= 34) return 'medium';
    return 'large';
  }
  if (/mini|nano|tiny|small|lite|flash|haiku|instant/i.test(text)) return 'small';
  if (/opus|ultra|large|405|70b|maverick/i.test(text)) return 'large';
  return 'unknown';
}

/** USD per 1M completion tokens — the number users actually feel. */
export function pricePerMillion(meta: ModelMeta): number | null {
  if (meta.price === undefined) return meta.isFree ? 0 : null;
  return meta.price.completion * 1_000_000;
}

export function priceClassOf(meta: ModelMeta): PriceClass {
  if (meta.isFree) return 'free';
  const perM = pricePerMillion(meta);
  if (perM === null) return 'unknown';
  if (perM === 0) return 'free';
  if (perM < 1) return 'cheap';
  if (perM < 10) return 'moderate';
  return 'expensive';
}

export function contextClassOf(meta: ModelMeta): ContextClass {
  const n = meta.contextLength;
  if (n === null || n === undefined || n <= 0) return 'unknown';
  if (n < 16_000) return 'short';
  if (n <= 200_000) return 'standard';
  return 'long';
}

function formatPerMillion(perM: number): string {
  return `$${perM.toFixed(2)}`;
}

/** Every sentence the template can emit, in one language. */
interface CopyPack {
  headline: Record<SizeClass, Record<'free' | 'paid', string>>;
  size: Record<'small' | 'medium' | 'large', string>;
  free: string;
  cheap: (per: string) => string;
  moderate: (per: string) => string;
  expensive: (per: string) => string;
  longContext: (ctx: string) => string;
  normalContext: (ctx: string) => string;
  formatDiscipline: string;
  webllm: string;
  ollama: string;
  /** Thousands / millions, abbreviated the way the language abbreviates them. */
  formatContext: (n: number) => string;
  tags: Record<
    'small' | 'medium' | 'large' | 'free' | 'cheap' | 'expensive' | 'longContext' | 'browser' | 'server',
    string
  >;
}

const PL: CopyPack = {
  headline: {
    small: {
      free: 'Szybki i darmowy model do prostych zadań.',
      paid: 'Szybki i tani model do prostych zadań.',
    },
    medium: {
      free: 'Uniwersalny model średniej wielkości — darmowy, więc świetny na start.',
      paid: 'Uniwersalny model — rozsądny kompromis między ceną a jakością.',
    },
    large: {
      free: 'Duży model dostępny za darmo — mocne rozumowanie bez rachunku.',
      paid: 'Duży model — najmocniejsze rozumowanie, ale i najwyższy rachunek.',
    },
    unknown: {
      free: 'Model bez podanego rozmiaru — darmowy, więc można go przetestować bez ryzyka.',
      paid: 'Model bez podanego rozmiaru w katalogu — oceń go po liczbach z rankingu.',
    },
  },
  size: {
    small:
      'Małe modele odpowiadają błyskawicznie i kosztują grosze, ale w grach logicznych częściej przeoczą wygraną lub nie zablokują przeciwnika.',
    medium:
      'Model średniej wielkości: zwykle solidnie radzi sobie z kółkiem i krzyżykiem, a w statkach bywa nierówny.',
    large:
      'Duże modele grają najrówniej i rzadko psują format odpowiedzi — to zwykle czołówka rankingu Precyzji.',
  },
  free: 'Nic nie kosztuje — partie z nim nie obciążą Twojego klucza.',
  cheap: (per) =>
    `Bardzo tani (${per} za milion tokenów odpowiedzi) — jedna partia to ułamek centa.`,
  moderate: (per) =>
    `Cena umiarkowana (${per} za milion tokenów odpowiedzi) — partia kosztuje ułamek centa, ale seria testów już się zsumuje.`,
  expensive: (per) =>
    `Drogi (${per} za milion tokenów odpowiedzi) — sprawdź w rankingu, czy w tej grze naprawdę wygrywa z tańszymi.`,
  longContext: (ctx) =>
    `Ogromne okno kontekstu (${ctx} tokenów), ale w tych grach to bez znaczenia — plansza mieści się w kilku zdaniach.`,
  normalContext: (ctx) =>
    `Okno kontekstu ${ctx} tokenów — w zupełności wystarcza: cała plansza to kilka zdań promptu.`,
  formatDiscipline:
    'Bywa niezdyscyplinowany w formacie odpowiedzi — wtedy w logu zobaczysz „poprawki", a po trzech nieudanych próbach ruch wymuszony (losowy legalny).',
  webllm:
    'Działa lokalnie w Twojej przeglądarce (WebGPU) — bez klucza, bez kosztów i bez wysyłania czegokolwiek na zewnątrz.',
  ollama:
    'Działa przez Ollamę na serwerze — takie partie są oznaczone jako zweryfikowane serwerowo.',
  formatContext: (n) =>
    n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1).replace('.0', '')} mln`
      : `${Math.round(n / 1000)} tys.`,
  tags: {
    small: 'mały',
    medium: 'średni',
    large: 'duży',
    free: 'darmowy',
    cheap: 'tani',
    expensive: 'drogi',
    longContext: 'długi kontekst',
    browser: 'w przeglądarce',
    server: 'serwer',
  },
};

const EN: CopyPack = {
  headline: {
    small: {
      free: 'A fast, free model for simple tasks.',
      paid: 'A fast, cheap model for simple tasks.',
    },
    medium: {
      free: 'An all-round mid-size model — free, so a good place to start.',
      paid: 'An all-round model — a sensible trade-off between price and quality.',
    },
    large: {
      free: 'A large model, available for free — strong reasoning, no bill.',
      paid: 'A large model — the strongest reasoning, and the steepest bill.',
    },
    unknown: {
      free: 'A model with no size in the catalog — free, so you can try it risk-free.',
      paid: 'A model with no size in the catalog — judge it by the ranking numbers.',
    },
  },
  size: {
    small:
      'Small models answer in a blink and cost pennies, but in logic games they more often miss a win or fail to block the opponent.',
    medium:
      'A mid-size model: usually solid at tic-tac-toe, and uneven at battleship.',
    large:
      'Large models play the most consistently and rarely break the answer format — usually the top of the Precision ranking.',
  },
  free: 'Costs nothing — matches against it will not touch your key.',
  cheap: (per) =>
    `Very cheap (${per} per million answer tokens) — one match is a fraction of a cent.`,
  moderate: (per) =>
    `Moderately priced (${per} per million answer tokens) — a match costs a fraction of a cent, but a series of tests adds up.`,
  expensive: (per) =>
    `Expensive (${per} per million answer tokens) — check the ranking to see whether it really beats the cheap ones at this game.`,
  longContext: (ctx) =>
    `A huge context window (${ctx} tokens) — irrelevant here, though: the board fits in a few sentences.`,
  normalContext: (ctx) =>
    `A ${ctx}-token context window — plenty: the whole board is a few sentences of prompt.`,
  formatDiscipline:
    'It can be undisciplined about the answer format — then the log shows “retries”, and after three failed attempts a forced move (a random legal one).',
  webllm:
    'Runs locally in your browser (WebGPU) — no key, no cost, and nothing is sent anywhere.',
  ollama: 'Runs through Ollama on the server — those matches are marked as server-verified.',
  formatContext: (n) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace('.0', '')}M` : `${Math.round(n / 1000)}k`,
  tags: {
    small: 'small',
    medium: 'medium',
    large: 'large',
    free: 'free',
    cheap: 'cheap',
    expensive: 'expensive',
    longContext: 'long context',
    browser: 'in-browser',
    server: 'server',
  },
};

const PACKS: Record<Locale, CopyPack> = { pl: PL, en: EN };

/**
 * Build the layman description. Pure and deterministic: the same metadata always
 * yields the same text in the same locale.
 */
export function describeModel(meta: ModelMeta, locale: Locale = 'pl'): ModelCopy {
  const copy = PACKS[locale];
  const size = sizeClassOf(meta);
  const priceClass = priceClassOf(meta);
  const contextClass = contextClassOf(meta);
  const free = priceClass === 'free';

  const headline = copy.headline[size][free ? 'free' : 'paid'];
  const sentences: string[] = [];
  const tags: string[] = [];

  // 1. Size → what to expect from its reasoning.
  if (size !== 'unknown') {
    sentences.push(copy.size[size]);
    tags.push(copy.tags[size]);
  }

  // 2. Price → the cost of a match, in words.
  const perM = pricePerMillion(meta);
  if (free) {
    sentences.push(copy.free);
    tags.push(copy.tags.free);
  } else if (perM !== null) {
    const per = formatPerMillion(perM);
    if (priceClass === 'cheap') {
      sentences.push(copy.cheap(per));
      tags.push(copy.tags.cheap);
    } else if (priceClass === 'moderate') {
      sentences.push(copy.moderate(per));
    } else {
      sentences.push(copy.expensive(per));
      tags.push(copy.tags.expensive);
    }
  }

  // 3. Context → mostly irrelevant here, and saying so is the educational point.
  if (contextClass !== 'unknown' && meta.contextLength) {
    const ctx = copy.formatContext(meta.contextLength);
    if (contextClass === 'long') {
      sentences.push(copy.longContext(ctx));
      tags.push(copy.tags.longContext);
    } else {
      sentences.push(copy.normalContext(ctx));
    }
  }

  // 4. The caveat that actually shows up in the telemetry.
  if (size === 'small' || size === 'unknown') {
    sentences.push(copy.formatDiscipline);
  }

  // 5. Where it runs.
  if (meta.provider === 'webllm') {
    sentences.push(copy.webllm);
    tags.push(copy.tags.browser);
  } else if (meta.provider === 'ollama') {
    sentences.push(copy.ollama);
    tags.push(copy.tags.server);
  }

  return { headline, sentences, tags, size, priceClass, contextClass };
}
