import type { PrefixedString } from './id.js';

export type Agent = {
  id: PrefixedString<'agt'>;
  name: string;
  type: 'primary' | 'sub';
  isDeletable: boolean;
  createdAt: number;
  updatedAt: number;
};
