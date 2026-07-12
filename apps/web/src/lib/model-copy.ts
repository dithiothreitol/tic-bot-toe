/**
 * Plain-Polish model descriptions (SPEC §12.3).
 *
 * Generated from catalog metadata by a RULE TEMPLATE — deterministic, free, and
 * offline. Explicitly NOT written by an LLM: the whole point of the model card
 * is to explain models to a layman, and an LLM-written blurb would cost money,
 * vary between reloads, and could hallucinate facts about the model.
 *
 * Inputs are only what the OpenRouter catalog gives us (size hints in the id,
 * price, context window) plus the provider.
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

function formatContext(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')} mln`;
  return `${Math.round(n / 1000)} tys.`;
}

function formatPerMillion(perM: number): string {
  return perM < 1 ? `$${perM.toFixed(2)}` : `$${perM.toFixed(2)}`;
}

const HEADLINE: Record<SizeClass, Record<'free' | 'paid', string>> = {
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
};

/**
 * Build the layman description. Pure and deterministic: the same metadata always
 * yields the same text.
 */
export function describeModel(meta: ModelMeta): ModelCopy {
  const size = sizeClassOf(meta);
  const priceClass = priceClassOf(meta);
  const contextClass = contextClassOf(meta);
  const free = priceClass === 'free';

  const headline = HEADLINE[size][free ? 'free' : 'paid'];
  const sentences: string[] = [];
  const tags: string[] = [];

  // 1. Size → what to expect from its reasoning.
  if (size === 'small') {
    sentences.push(
      'Małe modele odpowiadają błyskawicznie i kosztują grosze, ale w grach logicznych częściej przeoczą wygraną lub nie zablokują przeciwnika.',
    );
    tags.push('mały');
  } else if (size === 'medium') {
    sentences.push(
      'Model średniej wielkości: zwykle solidnie radzi sobie z kółkiem i krzyżykiem, a w statkach bywa nierówny.',
    );
    tags.push('średni');
  } else if (size === 'large') {
    sentences.push(
      'Duże modele grają najrówniej i rzadko psują format odpowiedzi — to zwykle czołówka rankingu Precyzji.',
    );
    tags.push('duży');
  }

  // 2. Price → the cost of a match, in words.
  const perM = pricePerMillion(meta);
  if (free) {
    sentences.push('Nic nie kosztuje — partie z nim nie obciążą Twojego klucza.');
    tags.push('darmowy');
  } else if (perM !== null) {
    const per = formatPerMillion(perM);
    if (priceClass === 'cheap') {
      sentences.push(
        `Bardzo tani (${per} za milion tokenów odpowiedzi) — jedna partia to ułamek centa.`,
      );
      tags.push('tani');
    } else if (priceClass === 'moderate') {
      sentences.push(
        `Cena umiarkowana (${per} za milion tokenów odpowiedzi) — partia kosztuje ułamek centa, ale seria testów już się zsumuje.`,
      );
    } else {
      sentences.push(
        `Drogi (${per} za milion tokenów odpowiedzi) — sprawdź w rankingu, czy w tej grze naprawdę wygrywa z tańszymi.`,
      );
      tags.push('drogi');
    }
  }

  // 3. Context → mostly irrelevant here, and saying so is the educational point.
  if (contextClass !== 'unknown' && meta.contextLength) {
    const ctx = formatContext(meta.contextLength);
    if (contextClass === 'long') {
      sentences.push(
        `Ogromne okno kontekstu (${ctx} tokenów), ale w tych grach to bez znaczenia — plansza mieści się w kilku zdaniach.`,
      );
      tags.push('długi kontekst');
    } else {
      sentences.push(
        `Okno kontekstu ${ctx} tokenów — w zupełności wystarcza: cała plansza to kilka zdań promptu.`,
      );
    }
  }

  // 4. The caveat that actually shows up in the telemetry.
  if (size === 'small' || size === 'unknown') {
    sentences.push(
      'Bywa niezdyscyplinowany w formacie odpowiedzi — wtedy w logu zobaczysz „poprawki", a po trzech nieudanych próbach ruch wymuszony (losowy legalny).',
    );
  }

  // 5. Where it runs.
  if (meta.provider === 'webllm') {
    sentences.push(
      'Działa lokalnie w Twojej przeglądarce (WebGPU) — bez klucza, bez kosztów i bez wysyłania czegokolwiek na zewnątrz.',
    );
    tags.push('w przeglądarce');
  } else if (meta.provider === 'ollama') {
    sentences.push(
      'Działa przez Ollamę na serwerze — takie partie są oznaczone jako zweryfikowane serwerowo.',
    );
    tags.push('serwer');
  }

  return { headline, sentences, tags, size, priceClass, contextClass };
}
