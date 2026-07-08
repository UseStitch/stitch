import { zValidator } from '@hono/zod-validator';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

import { getMailDb } from '@stitch/mail/db/client';
import { getAccount, getThread, listAccounts, listDrafts, listLabels, listThreads } from '@stitch/mail/db/queries';
import { mailAccounts } from '@stitch/mail/db/schema';

import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema/connectors.js';
import { assertCanEnrollMailAccount, filterEligibleMailAccounts } from '@/mail/eligibility.js';
import { getAttachmentRecord, getDraftView, getMessageView } from '@/mail/read-model.js';
import { getMailEngine, getMailSyncProgress, removeMailAccount } from '@/mail/wiring.js';
import type { Context } from 'hono';

const mailAccountIdSchema = z.templateLiteral([z.literal('macc_'), z.string().min(1)]);
const mailLabelIdSchema = z.templateLiteral([z.literal('mlbl_'), z.string().min(1)]);
const mailThreadIdSchema = z.templateLiteral([z.literal('mthr_'), z.string().min(1)]);
const mailMessageIdSchema = z.templateLiteral([z.literal('mmsg_'), z.string().min(1)]);
const mailAttachmentIdSchema = z.templateLiteral([z.literal('matt_'), z.string().min(1)]);
const mailDraftIdSchema = z.templateLiteral([z.literal('mdrf_'), z.string().min(1)]);

const accountIdParamSchema = z.object({ id: mailAccountIdSchema });
const threadIdParamSchema = z.object({ id: mailThreadIdSchema });
const messageIdParamSchema = z.object({ id: mailMessageIdSchema });
const attachmentIdParamSchema = z.object({ id: mailAttachmentIdSchema });
const draftIdParamSchema = z.object({ id: mailDraftIdSchema });

const accountPatchSchema = z.object({
  enabled: z.boolean().optional(),
  syncFrequencySeconds: z.number().int().min(30).optional(),
  backfillDays: z.number().int().positive().optional(),
});

const enrollSchema = z.object({
  connectorInstanceId: z.string().min(1),
  backfillDays: z.number().int().positive().optional(),
  syncFrequencySeconds: z.number().int().min(30).optional(),
});

const resyncSchema = z.object({ mode: z.enum(['full', 'incremental']) });

const threadsQuerySchema = z.object({
  labelId: mailLabelIdSchema.optional(),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const modifyMessageSchema = z.object({
  addLabelIds: z.array(mailLabelIdSchema).optional(),
  removeLabelIds: z.array(mailLabelIdSchema).optional(),
  markRead: z.boolean().optional(),
});

const addressSchema = z.object({ name: z.string().nullable(), email: z.string().email() });

const draftSchema = z.object({
  accountId: mailAccountIdSchema,
  to: z.array(addressSchema),
  cc: z.array(addressSchema).default([]),
  bcc: z.array(addressSchema).default([]),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string().nullable().default(null),
  inReplyToMessageId: mailMessageIdSchema.nullable().default(null),
});

const draftPatchSchema = draftSchema.partial().omit({ accountId: true });

export const mailRouter = new Hono();
type ConnectorInstanceId = (typeof connectorInstances.$inferSelect)['id'];

function errorResponse(c: Context, error: unknown, status: 400 | 404 | 500 = 500): Response {
  return c.json({ error: error instanceof Error ? error.message : String(error) }, status);
}

async function connectorInstanceById(connectorInstanceId: string) {
  const [instance] = await getDb()
    .select({
      id: connectorInstances.id,
      connectorId: connectorInstances.connectorId,
      status: connectorInstances.status,
      scopes: connectorInstances.scopes,
      accountEmail: connectorInstances.accountEmail,
    })
    .from(connectorInstances)
    .where(eq(connectorInstances.id, connectorInstanceId as ConnectorInstanceId));
  return instance;
}

mailRouter.get('/accounts', async (c) => c.json(await listAccounts()));

mailRouter.get('/eligible-accounts', async (c) => {
  const [instances, accounts] = await Promise.all([
    getDb()
      .select({
        id: connectorInstances.id,
        connectorId: connectorInstances.connectorId,
        status: connectorInstances.status,
        scopes: connectorInstances.scopes,
        accountEmail: connectorInstances.accountEmail,
      })
      .from(connectorInstances)
      .where(eq(connectorInstances.connectorId, 'google')),
    getMailDb().select({ connectorInstanceId: mailAccounts.connectorInstanceId }).from(mailAccounts),
  ]);

  return c.json(filterEligibleMailAccounts(instances, new Set(accounts.map((account) => account.connectorInstanceId))));
});

mailRouter.post('/accounts', zValidator('json', enrollSchema), async (c) => {
  const body = c.req.valid('json');
  const instance = await connectorInstanceById(body.connectorInstanceId);

  try {
    assertCanEnrollMailAccount(instance);
    const accountId = await getMailEngine().accounts.enroll({
      connectorInstanceId: body.connectorInstanceId,
      provider: 'gmail',
      email: instance.accountEmail,
      backfillDays: body.backfillDays,
      syncFrequencySeconds: body.syncFrequencySeconds,
    });
    const account = await getAccount(accountId);
    if (!account) return errorResponse(c, new Error('Mail account was not created'), 500);
    return c.json(account, 201);
  } catch (error) {
    return errorResponse(c, error, 400);
  }
});

mailRouter.patch(
  '/accounts/:id',
  zValidator('param', accountIdParamSchema),
  zValidator('json', accountPatchSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    await getMailEngine().accounts.update(id, c.req.valid('json'));
    const account = await getAccount(id);
    if (!account) return errorResponse(c, new Error('Mail account not found'), 404);
    return c.json(account);
  },
);

mailRouter.delete('/accounts/:id', zValidator('param', accountIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  await removeMailAccount(id);
  return c.body(null, 204);
});

mailRouter.post(
  '/accounts/:id/resync',
  zValidator('param', accountIdParamSchema),
  zValidator('json', resyncSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const { mode } = c.req.valid('json');
    getMailEngine().triggerSync(id, mode);
    return c.json({ accepted: true }, 202);
  },
);

mailRouter.get('/accounts/:id/labels', zValidator('param', accountIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await listLabels(id));
});

mailRouter.get(
  '/accounts/:id/threads',
  zValidator('param', accountIdParamSchema),
  zValidator('query', threadsQuerySchema),
  async (c) => {
    const { id } = c.req.valid('param');
    const query = c.req.valid('query');
    return c.json(
      await listThreads({ accountId: id, labelId: query.labelId, cursor: query.cursor, limit: query.limit }),
    );
  },
);

mailRouter.get('/threads/:id', zValidator('param', threadIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  await getMailEngine().ops.hydrateThread(id);
  const thread = await getThread(id);
  if (!thread) return errorResponse(c, new Error('Mail thread not found'), 404);
  return c.json(thread);
});

mailRouter.post(
  '/messages/:id/modify',
  zValidator('param', messageIdParamSchema),
  zValidator('json', modifyMessageSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    await getMailEngine().ops.modifyMessage(id, c.req.valid('json'));
    const message = await getMessageView(id);
    if (!message) return errorResponse(c, new Error('Mail message not found'), 404);
    return c.json(message);
  },
);

mailRouter.post('/threads/:id/trash', zValidator('param', threadIdParamSchema), async (c) => {
  await getMailEngine().ops.trashThread(c.req.valid('param').id);
  return c.json({ ok: true });
});

mailRouter.post('/threads/:id/untrash', zValidator('param', threadIdParamSchema), async (c) => {
  await getMailEngine().ops.untrashThread(c.req.valid('param').id);
  return c.json({ ok: true });
});

mailRouter.get('/attachments/:id', zValidator('param', attachmentIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  const [localPath, attachment] = await Promise.all([getMailEngine().ops.fetchAttachment(id), getAttachmentRecord(id)]);
  const file = Bun.file(localPath);
  if (!(await file.exists())) return errorResponse(c, new Error('Attachment file not found'), 404);
  const headers = new Headers();
  if (attachment) {
    headers.set('Content-Type', attachment.mimeType);
    headers.set('Content-Disposition', `attachment; filename="${attachment.filename.replaceAll('"', '\\"')}"`);
  }
  return new Response(file, { headers });
});

mailRouter.get('/accounts/:id/drafts', zValidator('param', accountIdParamSchema), async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await listDrafts(id));
});

mailRouter.post('/drafts', zValidator('json', draftSchema), async (c) => {
  const draftId = await getMailEngine().ops.createDraft(c.req.valid('json'));
  const draft = await getDraftView(draftId);
  if (!draft) return errorResponse(c, new Error('Mail draft not found'), 404);
  return c.json(draft, 201);
});

mailRouter.patch(
  '/drafts/:id',
  zValidator('param', draftIdParamSchema),
  zValidator('json', draftPatchSchema),
  async (c) => {
    const { id } = c.req.valid('param');
    await getMailEngine().ops.updateDraft(id, c.req.valid('json'));
    const draft = await getDraftView(id);
    if (!draft) return errorResponse(c, new Error('Mail draft not found'), 404);
    return c.json(draft);
  },
);

mailRouter.delete('/drafts/:id', zValidator('param', draftIdParamSchema), async (c) => {
  await getMailEngine().ops.deleteDraft(c.req.valid('param').id);
  return c.body(null, 204);
});

mailRouter.post('/drafts/:id/send', zValidator('param', draftIdParamSchema), async (c) => {
  await getMailEngine().ops.sendDraft(c.req.valid('param').id);
  return c.json({ accepted: true }, 202);
});

mailRouter.post('/send', zValidator('json', draftSchema), async (c) => {
  await getMailEngine().ops.send(c.req.valid('json'));
  return c.json({ accepted: true }, 202);
});

mailRouter.get('/sync/status', async (c) => {
  const accounts = await getMailDb()
    .select({
      accountId: mailAccounts.id,
      syncPhase: mailAccounts.syncPhase,
      lastSyncedAt: mailAccounts.lastSyncedAt,
      lastError: mailAccounts.lastError,
    })
    .from(mailAccounts)
    .where(and(eq(mailAccounts.enabled, true), eq(mailAccounts.provider, 'gmail')));

  return c.json(accounts.map((account) => ({ ...account, progress: getMailSyncProgress(account.accountId) })));
});
