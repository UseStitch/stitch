import type { PrefixedString } from './id.js';

export type Agent = {
  id: PrefixedString<'agt'>;
  name: string;
  type: 'primary' | 'sub';
  isDefault: boolean;
  isDeletable: boolean;
  createdAt: number;
  updatedAt: number;
};
