import { create } from 'zustand';

import type { MailAccountId, MailLabelId } from '@stitch/shared/mail/types';

type MailStore = {
  selectedAccountId: MailAccountId | null;
  selectedLabelId: MailLabelId | null;
  setSelectedAccountId: (accountId: MailAccountId | null) => void;
  setSelectedLabelId: (labelId: MailLabelId | null) => void;
};

export const useMailStore = create<MailStore>((set) => ({
  selectedAccountId: null,
  selectedLabelId: null,
  setSelectedAccountId: (selectedAccountId) => set({ selectedAccountId, selectedLabelId: null }),
  setSelectedLabelId: (selectedLabelId) => set({ selectedLabelId }),
}));
