import type { MailLabelView } from '@stitch/shared/mail/types';

export const SYSTEM_LABEL_ORDER = [
  'INBOX',
  'SENT',
  'DRAFT',
  'DRAFTS',
  'TRASH',
  'CATEGORY_PERSONAL',
  'CATEGORY_UPDATES',
  'CATEGORY_PROMOTIONS',
  'CATEGORY_SOCIAL',
  'CATEGORY_FORUMS',
  'IMPORTANT',
  'YELLOW_STAR',
  'STARRED',
  'UNREAD',
  'SPAM',
] as const;

const SYSTEM_LABEL_NAMES: Record<string, string> = {
  CATEGORY_FORUMS: 'Forums',
  CATEGORY_PERSONAL: 'Personal',
  CATEGORY_PROMOTIONS: 'Promotions',
  CATEGORY_SOCIAL: 'Social',
  CATEGORY_UPDATES: 'Updates',
  DRAFT: 'Drafts',
  DRAFTS: 'Drafts',
  IMPORTANT: 'Important',
  INBOX: 'Inbox',
  SENT: 'Sent',
  SPAM: 'Spam',
  STARRED: 'Starred',
  TRASH: 'Trash',
  UNREAD: 'Unread',
  YELLOW_STAR: 'Yellow Star',
};

export function titleCase(value: string): string {
  return value
    .split(/([\s_-]+)/)
    .map((part) => (part.trim() ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part))
    .join('');
}

export function getLabelParts(label: MailLabelView): string[] {
  return label.name.split(/(?<!\s)\/(?!\s)/).filter(Boolean);
}

export function getLabelDisplayName(label: MailLabelView): string {
  const normalized = label.providerLabelId.toUpperCase();
  if (SYSTEM_LABEL_NAMES[normalized]) return SYSTEM_LABEL_NAMES[normalized];

  const parts = getLabelParts(label);
  return parts.at(-1) ?? titleCase(label.name);
}
