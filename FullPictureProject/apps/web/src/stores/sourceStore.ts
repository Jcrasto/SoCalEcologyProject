import { create } from "zustand";

interface SourceStore {
  selectedSourceId: string | null;
  showGlobe: boolean;
  setSelectedSource: (id: string | null) => void;
  toggleGlobe: () => void;
}

export const useSourceStore = create<SourceStore>((set) => ({
  selectedSourceId: null,
  showGlobe: false,
  setSelectedSource: (id) => set({ selectedSourceId: id }),
  toggleGlobe: () => set((s) => ({ showGlobe: !s.showGlobe })),
}));
