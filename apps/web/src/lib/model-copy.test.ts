import {
  type ModelMeta,
  contextClassOf,
  describeModel,
  priceClassOf,
  sizeClassOf,
} from './model-copy';

const base: ModelMeta = {
  provider: 'openrouter',
  id: 'vendor/model',
  name: 'Model',
  isFree: false,
  contextLength: 32_000,
  price: { prompt: 0.000001, completion: 0.000002 }, // $2 / 1M completion
};

const meta = (over: Partial<ModelMeta>): ModelMeta => ({ ...base, ...over });

describe('sizeClassOf', () => {
  it('reads the parameter count out of the model id', () => {
    expect(sizeClassOf(meta({ id: 'meta-llama/llama-3.1-8b-instruct' }))).toBe('medium');
    expect(sizeClassOf(meta({ id: 'qwen/qwen2.5-3b-instruct' }))).toBe('small');
    expect(sizeClassOf(meta({ id: 'meta-llama/llama-3.1-405b' }))).toBe('large');
  });

  it('falls back to name hints when there is no parameter count', () => {
    expect(sizeClassOf(meta({ id: 'openai/gpt-4o-mini', name: 'GPT-4o mini' }))).toBe('small');
    expect(sizeClassOf(meta({ id: 'anthropic/claude-opus', name: 'Claude Opus' }))).toBe('large');
    expect(sizeClassOf(meta({ id: 'vendor/mystery', name: 'Mystery' }))).toBe('unknown');
  });

  it('treats every WebLLM model as small (only small models run in a browser)', () => {
    expect(sizeClassOf(meta({ provider: 'webllm', id: 'Whatever-MLC' }))).toBe('small');
  });
});

describe('priceClassOf / contextClassOf', () => {
  it('buckets price by USD per million completion tokens', () => {
    expect(priceClassOf(meta({ isFree: true }))).toBe('free');
    expect(priceClassOf(meta({ price: { prompt: 0, completion: 0.0000005 } }))).toBe('cheap'); // $0.50/M
    expect(priceClassOf(meta({ price: { prompt: 0, completion: 0.000002 } }))).toBe('moderate'); // $2/M
    expect(priceClassOf(meta({ price: { prompt: 0, completion: 0.00006 } }))).toBe('expensive'); // $60/M
  });

  it('buckets the context window', () => {
    expect(contextClassOf(meta({ contextLength: 8_000 }))).toBe('short');
    expect(contextClassOf(meta({ contextLength: 128_000 }))).toBe('standard');
    expect(contextClassOf(meta({ contextLength: 1_000_000 }))).toBe('long');
    expect(contextClassOf(meta({ contextLength: null }))).toBe('unknown');
  });
});

describe('describeModel', () => {
  it('is deterministic — same metadata, same copy', () => {
    const m = meta({ id: 'qwen/qwen2.5-3b-instruct' });
    expect(describeModel(m)).toEqual(describeModel(m));
  });

  it('describes a small free model as fast, free, and format-sloppy (§12.3)', () => {
    const copy = describeModel(
      meta({ id: 'qwen/qwen2.5-3b-instruct:free', isFree: true, price: undefined }),
    );
    expect(copy.headline).toContain('Szybki');
    expect(copy.tags).toContain('darmowy');
    expect(copy.tags).toContain('mały');
    // The caveat SPEC asks for by name: undisciplined response format.
    expect(copy.sentences.join(' ')).toContain('niezdyscyplinowany w formacie');
  });

  it('warns that an expensive model must earn its price', () => {
    const copy = describeModel(
      meta({ id: 'anthropic/claude-opus', price: { prompt: 0, completion: 0.00006 } }),
    );
    expect(copy.tags).toContain('drogi');
    expect(copy.sentences.join(' ')).toContain('czy w tej grze naprawdę wygrywa z tańszymi');
    // Big models are not accused of breaking the format.
    expect(copy.sentences.join(' ')).not.toContain('niezdyscyplinowany w formacie');
  });

  it('says a huge context window does not matter for these games', () => {
    const copy = describeModel(meta({ contextLength: 1_000_000 }));
    expect(copy.sentences.join(' ')).toContain('bez znaczenia');
    expect(copy.tags).toContain('długi kontekst');
  });

  it('tells the user a WebLLM model runs in their own browser', () => {
    const copy = describeModel(
      meta({ provider: 'webllm', id: 'Llama-3.2-3B-Instruct-q4f16_1-MLC', isFree: true }),
    );
    expect(copy.tags).toContain('w przeglądarce');
    expect(copy.sentences.join(' ')).toContain('WebGPU');
  });
});
