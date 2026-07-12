import { create } from 'zustand';

/** Tracks WebLLM weight-download progress for the UI bar (SPEC §2.2). */
interface ModelLoadState {
  active: boolean;
  progress: number; // 0..1
  text: string;
  modelId: string | null;
  begin: (modelId: string) => void;
  update: (progress: number, text: string) => void;
  finish: () => void;
}

export const useModelLoad = create<ModelLoadState>((set) => ({
  active: false,
  progress: 0,
  text: '',
  modelId: null,
  begin: (modelId) => set({ active: true, progress: 0, text: '', modelId }),
  update: (progress, text) => set({ progress, text }),
  finish: () => set({ active: false, progress: 1 }),
}));
