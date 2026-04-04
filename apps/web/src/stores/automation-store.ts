import { create } from 'zustand';

type AutomationStore = {
  selectedAutomationId: string | null;
  createDialogOpen: boolean;
  editingAutomationId: string | null;
  setSelectedAutomationId: (id: string | null) => void;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openEditDialog: (id: string) => void;
  closeEditDialog: () => void;
};

export const useAutomationStore = create<AutomationStore>((set) => ({
  selectedAutomationId: null,
  createDialogOpen: false,
  editingAutomationId: null,
  setSelectedAutomationId: (id) => set({ selectedAutomationId: id }),
  openCreateDialog: () => set({ createDialogOpen: true, editingAutomationId: null }),
  closeCreateDialog: () => set({ createDialogOpen: false }),
  openEditDialog: (id) => set({ editingAutomationId: id, selectedAutomationId: id, createDialogOpen: false }),
  closeEditDialog: () => set({ editingAutomationId: null }),
}));
