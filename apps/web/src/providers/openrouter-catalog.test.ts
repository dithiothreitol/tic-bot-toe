import { fetchCatalog, parseCatalog, priceForModel } from './openrouter-catalog';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('parseCatalog', () => {
  it('parses the {data:[...]} envelope and computes the free flag', () => {
    const models = parseCatalog({
      data: [
        { id: 'a/free', name: 'Free', pricing: { prompt: '0', completion: '0' }, context_length: 8192 },
        { id: 'b/paid', name: 'Paid', pricing: { prompt: '0.000002', completion: '0.000004' } },
      ],
    });
    expect(models).toHaveLength(2);
    expect(models[0].isFree).toBe(true);
    expect(models[0].contextLength).toBe(8192);
    expect(models[1].isFree).toBe(false);
    expect(models[1].pricePromptPerToken).toBeCloseTo(0.000002, 12);
  });

  it('accepts a bare array and defaults missing pricing/name', () => {
    const models = parseCatalog([{ id: 'x/y' }]);
    expect(models[0].isFree).toBe(true);
    expect(models[0].name).toBe('x/y');
    expect(models[0].contextLength).toBeNull();
  });

  it('drops entries without an id', () => {
    const models = parseCatalog({ data: [{ name: 'no id' }, { id: 'ok' }] });
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('ok');
  });
});

describe('priceForModel', () => {
  it('finds a price snapshot or returns undefined', () => {
    const models = parseCatalog([{ id: 'a', pricing: { prompt: '0.001', completion: '0.002' } }]);
    expect(priceForModel(models, 'a')).toEqual({ prompt: 0.001, completion: 0.002 });
    expect(priceForModel(models, 'missing')).toBeUndefined();
  });
});

describe('fetchCatalog', () => {
  beforeEach(() => localStorage.clear());

  it('fetches /models and serves subsequent calls from the 1h cache', async () => {
    const fetchImpl = (async () =>
      jsonResponse({ data: [{ id: 'a', pricing: { prompt: '0', completion: '0' } }] })) as typeof fetch;
    const first = await fetchCatalog({ fetchImpl, now: () => 1000 });
    expect(first[0].id).toBe('a');

    let called = 0;
    const countingFetch = (async () => {
      called += 1;
      return jsonResponse({ data: [] });
    }) as typeof fetch;
    const second = await fetchCatalog({
      fetchImpl: countingFetch,
      now: () => 1000 + 30 * 60 * 1000,
    });
    expect(called).toBe(0); // served from cache
    expect(second[0].id).toBe('a');
  });

  it('refetches after the TTL expires', async () => {
    await fetchCatalog({
      fetchImpl: (async () => jsonResponse({ data: [{ id: 'old' }] })) as typeof fetch,
      now: () => 1000,
    });
    let called = 0;
    const res = await fetchCatalog({
      fetchImpl: (async () => {
        called += 1;
        return jsonResponse({ data: [{ id: 'new' }] });
      }) as typeof fetch,
      now: () => 1000 + 61 * 60 * 1000,
    });
    expect(called).toBe(1);
    expect(res[0].id).toBe('new');
  });

  it('throws on a non-ok response', async () => {
    const fetchImpl = (async () => jsonResponse({}, false, 500)) as typeof fetch;
    await expect(fetchCatalog({ fetchImpl, now: () => 1, force: true })).rejects.toThrow(/500/);
  });
});
