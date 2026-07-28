import { SendIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { useForm, useStore } from '@tanstack/react-form';

import type {
  MailAccountId,
  MailAddressView,
  MailDraftId,
  MailDraftView,
  MailMessageId,
  MailMessageView,
} from '@stitch/shared/mail/types';

import { Icon } from '@/components/primitives/icon';
import { Button } from '@/components/ui/button';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
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

function isAddressList(value: string): boolean {
  return parseAddresses(value).every((address) => z.email().safeParse(address.email).success);
}

const INVALID_ADDRESSES = 'Enter valid email addresses separated by commas';

const composerSchema = z.object({
  to: z
    .string()
    .refine((value) => parseAddresses(value).length > 0, 'Add at least one recipient')
    .refine(isAddressList, INVALID_ADDRESSES),
  cc: z.string().refine(isAddressList, INVALID_ADDRESSES),
  bcc: z.string().refine(isAddressList, INVALID_ADDRESSES),
  subject: z.string(),
  bodyText: z.string(),
});

type ComposerValues = z.infer<typeof composerSchema>;

function buildPayload(values: ComposerValues, accountId: MailAccountId, inReplyToMessageId: MailMessageId | null) {
  return {
    accountId,
    to: parseAddresses(values.to),
    cc: parseAddresses(values.cc),
    bcc: parseAddresses(values.bcc),
    subject: values.subject,
    bodyText: values.bodyText,
    bodyHtml: null,
    inReplyToMessageId,
  };
}

export function Composer({ accountId, draft, replyTo, onClose }: ComposerProps) {
  const createDraft = useCreateMailDraft();
  const updateDraft = useUpdateMailDraft();
  const sendDraft = useSendMailDraft();
  const sendMessage = useSendMailMessage();
  const inReplyToMessageId = draft?.inReplyToMessageId ?? replyTo?.id ?? null;
  const draftIdRef = React.useRef<MailDraftId | null>(draft?.id ?? null);
  const draftSaveRef = React.useRef<Promise<MailDraftId> | null>(null);

  function persistDraft(values: ComposerValues): Promise<MailDraftId> {
    const payload = buildPayload(values, accountId, inReplyToMessageId);
    const previousSave = draftSaveRef.current;
    const save = (
      previousSave ? previousSave.catch(() => draftIdRef.current) : Promise.resolve(draftIdRef.current)
    ).then(async (draftId) => {
      if (draftId) {
        await updateDraft.mutateAsync({ id: draftId, ...payload });
        return draftId;
      }

      const created = await createDraft.mutateAsync(payload);
      draftIdRef.current = created.id;
      return created.id;
    });
    draftSaveRef.current = save;
    return save;
  }

  const form = useForm({
    defaultValues: {
      to: formatAddresses(draft?.to ?? (replyTo?.from ? [replyTo.from] : [])),
      cc: formatAddresses(draft?.cc ?? []),
      bcc: formatAddresses(draft?.bcc ?? []),
      subject: draft?.subject ?? (replyTo ? getReplySubject(replyTo.subject) : ''),
      bodyText: draft?.bodyText ?? '',
    } satisfies ComposerValues,
    validators: { onMount: composerSchema, onChange: composerSchema },
    onSubmit: async ({ value }) => {
      const hasDraft = draftIdRef.current !== null || draftSaveRef.current !== null;
      onClose();
      toast.success('Sending message…', { id: 'mail-message-send' });
      try {
        if (hasDraft) {
          const draftId = await persistDraft(value);
          await sendDraft.mutateAsync({ id: draftId, accountId });
        } else {
          await sendMessage.mutateAsync(buildPayload(value, accountId, inReplyToMessageId));
        }
        toast.success('Message queued to send', { id: 'mail-message-send' });
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, 'Failed to send message'), { id: 'mail-message-send' });
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const autosaveDraft = React.useEffectEvent((nextValues: ComposerValues) => {
    void persistDraft(nextValues).catch(() => undefined);
  });

  React.useEffect(() => {
    const hasContent = values.to.trim() || values.subject.trim() || values.bodyText.trim();
    if (!hasContent) return;

    const timer = window.setTimeout(() => {
      autosaveDraft(values);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [values]);

  return (
    <form
      className="fixed right-6 bottom-6 z-40 flex w-lg max-w-[calc(100vw-3rem)] flex-col rounded-lg border border-border bg-card shadow-lg"
      onSubmit={(event) => {
        event.preventDefault();
      }}>
      <div className="flex items-center justify-between border-b border-border px-space-l py-space-m">
        <div className="text-sm font-medium">{replyTo ? 'Reply' : draft ? 'Edit draft' : 'New message'}</div>
        <Button type="button" variant="ghost" size="icon-xs" onClick={onClose} aria-label="Close composer">
          <Icon as={XIcon} size="s" />
        </Button>
      </div>
      <div className="space-y-space-l p-space-l">
        <form.Field name="to">
          {(field) => (
            <div className="space-y-space-xs">
              <Label htmlFor="mail-to">To</Label>
              <Input
                id="mail-to"
                value={field.state.value}
                placeholder="name@example.com"
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>
        <div className="grid grid-cols-2 gap-space-m">
          <form.Field name="cc">
            {(field) => (
              <div className="space-y-space-xs">
                <Label htmlFor="mail-cc">Cc</Label>
                <Input
                  id="mail-cc"
                  value={field.state.value}
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>
          <form.Field name="bcc">
            {(field) => (
              <div className="space-y-space-xs">
                <Label htmlFor="mail-bcc">Bcc</Label>
                <Input
                  id="mail-bcc"
                  value={field.state.value}
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>
        </div>
        <form.Field name="subject">
          {(field) => (
            <div className="space-y-space-xs">
              <Label htmlFor="mail-subject">Subject</Label>
              <Input
                id="mail-subject"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            </div>
          )}
        </form.Field>
        <form.Field name="bodyText">
          {(field) => (
            <Textarea
              value={field.state.value}
              placeholder="Write your message…"
              className="min-h-40"
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
      </div>
      <div className="flex items-center justify-between border-t border-border px-space-l py-space-m">
        <div className="text-xs text-muted-foreground">Drafts autosave after a short pause.</div>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="button"
              disabled={isSubmitting || sendDraft.isPending || sendMessage.isPending}
              onClick={() => void form.handleSubmit()}>
              <Icon as={SendIcon} size="s" />
              Send
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
