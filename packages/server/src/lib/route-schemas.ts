import { z } from 'zod';

import { ID_PREFIXES, type IdPrefix, type PrefixedString } from '@stitch/shared/id';

export function paginationQuerySchema(defaults: { pageSize?: number } = {}) {
  const defaultPageSize = defaults.pageSize ?? 20;
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(defaultPageSize),
  });
}

function prefixedId<P extends IdPrefix>(prefix: P) {
  return z.templateLiteral([z.literal(`${prefix}_`), z.string()]) as z.ZodType<PrefixedString<P>>;
}

export const routeSchemas = {
  sessionId: prefixedId(ID_PREFIXES.session),
  messageId: prefixedId(ID_PREFIXES.message),
  partId: prefixedId(ID_PREFIXES.part),
  toolResultId: prefixedId(ID_PREFIXES.toolResult),
  questionId: prefixedId(ID_PREFIXES.question),
  permissionResponseId: prefixedId(ID_PREFIXES.permissionResponse),
  permissionRuleId: prefixedId(ID_PREFIXES.permissionRule),
  mcpServerId: prefixedId(ID_PREFIXES.mcpServer),
  connectorInstanceId: prefixedId(ID_PREFIXES.connectorInstance),
  automationId: prefixedId(ID_PREFIXES.automation),
  scheduledJobId: prefixedId(ID_PREFIXES.scheduledJob),
  scheduledJobRunId: prefixedId(ID_PREFIXES.scheduledJobRun),
  recordingId: prefixedId(ID_PREFIXES.recording),
  recordingAnalysisId: prefixedId(ID_PREFIXES.recordingAnalysis),
  agendaListId: prefixedId(ID_PREFIXES.agendaList),
  agendaItemId: prefixedId(ID_PREFIXES.agendaItem),
  todoId: prefixedId(ID_PREFIXES.todo),
  meetingNoteTemplateId: prefixedId(ID_PREFIXES.meetingNoteTemplate),
  mailAccountId: prefixedId(ID_PREFIXES.mailAccount),
  mailLabelId: prefixedId(ID_PREFIXES.mailLabel),
  mailThreadId: prefixedId(ID_PREFIXES.mailThread),
  mailMessageId: prefixedId(ID_PREFIXES.mailMessage),
  mailAttachmentId: prefixedId(ID_PREFIXES.mailAttachment),
  mailDraftId: prefixedId(ID_PREFIXES.mailDraft),
} as const;
