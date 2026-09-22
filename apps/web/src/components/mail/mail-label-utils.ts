import { z } from 'zod';

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

const SYSTEM_LABEL_NAMES = {
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
} satisfies Record<string, string>;

const collapsedLabelStateSchema = z.object({
  labels: z.array(z.string()),
  sections: z.array(z.enum(['categories', 'markers', 'custom'])),
});

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
  const systemLabelName = Object.entries(SYSTEM_LABEL_NAMES).find(([labelId]) => labelId === normalized)?.[1];
  if (systemLabelName) return systemLabelName;

  const parts = getLabelParts(label);
  return parts.at(-1) ?? titleCase(label.name);
}

function getCollapsedLabelStateKey(accountId: MailAccountId): string {
  return `${COLLAPSED_LABEL_STATE_KEY_PREFIX}.${accountId}`;
}

export function readCollapsedLabelState(accountId: MailAccountId): CollapsedLabelState {
  if (typeof window === 'undefined') return { labels: [], sections: [] };

  const stored = window.localStorage.getItem(getCollapsedLabelStateKey(accountId));
  if (!stored) return { labels: [], sections: [] };

  try {
    const parsed = collapsedLabelStateSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : { labels: [], sections: [] };
  } catch {
    return { labels: [], sections: [] };
  }
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
