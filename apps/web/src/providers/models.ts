import type { TokenPrice } from './llm-runner';
import type { OllamaModel } from './ollama';
import type { CatalogModel } from './openrouter-catalog';
import { WEBLLM_MODELS } from './webllm';

/** A model the user can pick, unified across providers. */
export interface SelectableModel {
  provider: 'openrouter' | 'webllm' | 'ollama';
  /** OpenRouter model id, WebLLM MLC id, or Ollama model name. */
  id: string;
  name: string;
  isFree: boolean;
  contextLength?: number | null;
  price?: TokenPrice;
  /** Model does hidden reasoning; needs a roomier token ceiling (see catalog). */
  isReasoning?: boolean;
}

export function catalogToSelectable(models: CatalogModel[]): SelectableModel[] {
  return models.map((m) => ({
    provider: 'openrouter',
    id: m.id,
    name: m.name,
    isFree: m.isFree,
    contextLength: m.contextLength,
    price: { prompt: m.pricePromptPerToken, completion: m.priceCompletionPerToken },
    isReasoning: m.isReasoning,
  }));
}

export function webLlmSelectable(): SelectableModel[] {
  return WEBLLM_MODELS.map((m) => ({
    provider: 'webllm',
    id: m.mlcId,
    name: m.name,
    isFree: true,
  }));
}

export function ollamaSelectable(models: OllamaModel[]): SelectableModel[] {
  return models.map((m) => ({
    provider: 'ollama',
    id: m.name,
    name: m.name,
    isFree: true,
  }));
}
