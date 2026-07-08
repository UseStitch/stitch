import { SendIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import type {
  MailAccountId,
  MailAddressView,
  MailDraftId,
  MailDraftView,
  MailMessageView,
} from '@stitch/shared/mail/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { getErrorMessage } from '@/lib/errors';
import { useCreateMailDraft, useSendMailDraft, useSendMailMessage, useUpdateMailDraft } from '@/lib/mutations/mail';

type ComposerProps = {
  accountId: MailAccountId;
  draft?: MailDraftView;
  replyTo?: MailMessageView;
  onClose: () => void;
};

function parseAddresses(value: string): MailAddressView[] {
  return value
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
    .map((email) => ({ name: null, email }));
}

function formatAddresses(addresses: MailAddressView[]): string {
  return addresses.map((address) => address.email).join(', ');
}

function getReplySubject(subject: string | null): string {
  if (!subject) return 'Re:';
  return subject.toLowerCase().startsWith('re:') ? subject : `Re: ${subject}`;
}

export function Composer({ accountId, draft, replyTo, onClose }: ComposerProps) {
  const [draftId, setDraftId] = React.useState<MailDraftId | null>(draft?.id ?? null);
  const [to, setTo] = React.useState(() => formatAddresses(draft?.to ?? (replyTo?.from ? [replyTo.from] : [])));
  const [cc, setCc] = React.useState(() => formatAddresses(draft?.cc ?? []));
  const [bcc, setBcc] = React.useState(() => formatAddresses(draft?.bcc ?? []));
  const [subject, setSubject] = React.useState(draft?.subject ?? (replyTo ? getReplySubject(replyTo.subject) : ''));
  const [bodyText, setBodyText] = React.useState(draft?.bodyText ?? '');
  const createDraft = useCreateMailDraft();
  const updateDraft = useUpdateMailDraft();
  const sendDraft = useSendMailDraft();
  const sendMessage = useSendMailMessage();
  const inReplyToMessageId = draft?.inReplyToMessageId ?? replyTo?.id ?? null;

  const payload = React.useMemo(
    () => ({
      accountId,
      to: parseAddresses(to),
      cc: parseAddresses(cc),
      bcc: parseAddresses(bcc),
      subject,
      bodyText,
      bodyHtml: null,
      inReplyToMessageId,
    }),
    [accountId, bcc, bodyText, cc, inReplyToMessageId, subject, to],
  );

  React.useEffect(() => {
    const hasContent = payload.to.length > 0 || payload.subject.trim() || payload.bodyText.trim();
    if (!hasContent) return;

    const timer = window.setTimeout(() => {
      if (draftId) {
        updateDraft.mutate({ id: draftId, ...payload });
        return;
      }
      createDraft.mutate(payload, { onSuccess: (created) => setDraftId(created.id) });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [createDraft, draftId, payload, updateDraft]);

  function handleSend() {
    onClose();
    toast.success('Sending message…', { id: 'mail-message-send' });
    const promise = draftId ? sendDraft.mutateAsync({ id: draftId, accountId }) : sendMessage.mutateAsync(payload);
    void promise
      .then(() => toast.success('Message queued to send', { id: 'mail-message-send' }))
      .catch((error: unknown) =>
        toast.error(getErrorMessage(error, 'Failed to send message'), { id: 'mail-message-send' }),
      );
  }

  return (
    <div className="fixed right-6 bottom-6 z-40 flex w-lg max-w-[calc(100vw-3rem)] flex-col rounded-lg border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="text-sm font-medium">{replyTo ? 'Reply' : draft ? 'Edit draft' : 'New message'}</div>
        <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close composer">
          <XIcon className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-3 p-3">
        <div className="space-y-1">
          <Label htmlFor="mail-to">To</Label>
          <Input
            id="mail-to"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="mail-cc">Cc</Label>
            <Input id="mail-cc" value={cc} onChange={(event) => setCc(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mail-bcc">Bcc</Label>
            <Input id="mail-bcc" value={bcc} onChange={(event) => setBcc(event.target.value)} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mail-subject">Subject</Label>
          <Input id="mail-subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
        </div>
        <Textarea
          value={bodyText}
          onChange={(event) => setBodyText(event.target.value)}
          placeholder="Write your message…"
          className="min-h-40"
        />
      </div>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <div className="text-xs text-muted-foreground">Drafts autosave after a short pause.</div>
        <Button onClick={handleSend} disabled={payload.to.length === 0 || sendDraft.isPending || sendMessage.isPending}>
          <SendIcon className="size-3.5" />
          Send
        </Button>
      </div>
    </div>
  );
}
