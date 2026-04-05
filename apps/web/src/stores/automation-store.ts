import { create } from 'zustand';

type AutomationStore = {
  createDialogOpen: boolean;
  editingAutomationId: string | null;
  openCreateDialog: () => void;
  closeCreateDialog: () => void;
  openEditDialog: (id: string) => void;
  closeEditDialog: () => void;
};

export const useAutomationStore = create<AutomationStore>((set) => ({
  createDialogOpen: false,
  editingAutomationId: null,
  openCreateDialog: () => set({ createDialogOpen: true, editingAutomationId: null }),
  closeCreateDialog: () => set({ createDialogOpen: false }),
  openEditDialog: (id) => set({ editingAutomationId: id, createDialogOpen: false }),
  closeEditDialog: () => set({ editingAutomationId: null }),
}));
