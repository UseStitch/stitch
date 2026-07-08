import type { MailAccountId, MailLabelView } from '@stitch/shared/mail/types';

export type LabelSection = 'categories' | 'markers' | 'custom';

type CollapsedLabelState = { labels: string[]; sections: LabelSection[] };

const COLLAPSED_LABEL_STATE_KEY_PREFIX = 'stitch.mail.collapsed-labels';

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

function getCollapsedLabelStateKey(accountId: MailAccountId): string {
  return `${COLLAPSED_LABEL_STATE_KEY_PREFIX}.${accountId}`;
}

function isLabelSection(value: string): value is LabelSection {
  return value === 'categories' || value === 'markers' || value === 'custom';
}

export function readCollapsedLabelState(accountId: MailAccountId): CollapsedLabelState {
  if (typeof window === 'undefined') return { labels: [], sections: [] };

  const stored = window.localStorage.getItem(getCollapsedLabelStateKey(accountId));
  if (!stored) return { labels: [], sections: [] };

  const parsed = JSON.parse(stored) as Partial<CollapsedLabelState>;
  return {
    labels: Array.isArray(parsed.labels) ? parsed.labels.filter((value) => typeof value === 'string') : [],
    sections: Array.isArray(parsed.sections) ? parsed.sections.filter(isLabelSection) : [],
  };
}

export function writeCollapsedLabelState(
  accountId: MailAccountId,
  collapsedLabels: Set<string>,
  collapsedSections: Set<LabelSection>,
) {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(
    getCollapsedLabelStateKey(accountId),
    JSON.stringify({ labels: [...collapsedLabels], sections: [...collapsedSections] } satisfies CollapsedLabelState),
  );
}
