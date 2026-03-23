import { create } from 'zustand';

type AgentStoreState = {
  cycleAgent: (() => void) | null;
  setCycleAgent: (fn: (() => void) | null) => void;
};

export const useAgentStore = create<AgentStoreState>()((set) => ({
  cycleAgent: null,
  setCycleAgent: (fn) => set({ cycleAgent: fn }),
}));
