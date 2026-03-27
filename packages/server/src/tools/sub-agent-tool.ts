import { tool } from 'ai';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { createMessageId, createPartId, createSessionId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';

import { getAgentSubAgents } from '@/agents/sub-agent-config.js';
import type { SubAgentWithConfig } from '@/agents/sub-agent-config.js';
import { getDb } from '@/db/client.js';
import { agents, messages, providerConfig, sessions } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import * as Sse from '@/lib/sse.js';
import { runStream } from '@/lib/stream-runner.js';
import { buildCompactedHistory } from '@/llm/compaction';
import type { ProviderCredentials } from '@/provider/provider.js';
import type { Tool } from 'ai';

const log = Log.create({ service: 'sub-agent-tool' });

/**
 * Sanitize an agent name into a valid tool name.
 * Tool names must be alphanumeric with underscores only.
 */
function sanitizeToolName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

type SubAgentToolContext = {
  sessionId: PrefixedString<'ses'>;
  messageId: PrefixedString<'msg'>;
  credentials: ProviderCredentials;
  modelId: string;
  parentAbortSignal: AbortSignal;
};

const subAgentInputSchema = z.object({
  task: z.string().describe('The task or message to send to the sub-agent'),
  additionalContext: z
    .string()
    .optional()
    .describe(
      'Additional instructions or context to append to the sub-agent system prompt for this invocation',
    ),
});

/**
 * Resolve the credentials and modelId for a sub-agent invocation.
 * If the link specifies an override providerId/modelId, look up credentials
 * for that provider. Otherwise fall back to the parent context.
 */
async function resolveSubAgentProvider(
  subAgent: SubAgentWithConfig,
  parentContext: SubAgentToolContext,
): Promise<{ credentials: ProviderCredentials; modelId: string }> {
  if (!subAgent.providerId || !subAgent.modelId) {
    return { credentials: parentContext.credentials, modelId: parentContext.modelId };
  }

  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, subAgent.providerId));

  if (!config) {
    log.warn(
      {
        event: 'subagent.provider.fallback',
        subAgentId: subAgent.id,
        configuredProviderId: subAgent.providerId,
      },
      'sub-agent configured provider not found, falling back to parent',
    );
    return { credentials: parentContext.credentials, modelId: parentContext.modelId };
  }

  return { credentials: config.credentials, modelId: subAgent.modelId };
}

function createSubAgentTool(
  subAgent: SubAgentWithConfig,
  parentContext: SubAgentToolContext,
): Tool {
  return tool({
    description:
      `Invoke the "${subAgent.name}" sub-agent. ${subAgent.systemPrompt ? `This agent: ${subAgent.systemPrompt.slice(0, 200)}` : ''}`.trim(),
    inputSchema: subAgentInputSchema,
    execute: async (input, meta) => {
      const { toolCallId } = meta;
      const effectiveAbortSignal = meta.abortSignal ?? parentContext.parentAbortSignal;

      log.info(
        {
          event: 'subagent.invocation.started',
          toolCallId,
          subAgentId: subAgent.id,
          subAgentName: subAgent.name,
          parentSessionId: parentContext.sessionId,
          taskPreview: input.task.slice(0, 200),
        },
        'sub-agent invocation started',
      );

      try {
        const result = await executeSubAgent({
          subAgent,
          task: input.task,
          additionalContext: input.additionalContext,
          parentContext,
          abortSignal: effectiveAbortSignal,
          onChildSessionCreated: async (childSessionId) => {
            await Sse.broadcast('stream-tool-state', {
              sessionId: parentContext.sessionId,
              messageId: parentContext.messageId,
              toolCallId,
              toolName: `subagent_${sanitizeToolName(subAgent.name)}`,
              status: 'in-progress',
              output: { childSessionId, subAgentName: subAgent.name },
            });
          },
        });

        log.info(
          {
            event: 'subagent.invocation.completed',
            toolCallId,
            subAgentId: subAgent.id,
            childSessionId: result.childSessionId,
            resultLength: result.text.length,
          },
          'sub-agent invocation completed',
        );

        return {
          childSessionId: result.childSessionId,
          subAgentName: subAgent.name,
          text: result.text || 'Sub-agent completed but produced no text output.',
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(
          {
            event: 'subagent.invocation.failed',
            toolCallId,
            subAgentId: subAgent.id,
            error: message,
          },
          'sub-agent invocation failed',
        );

        return {
          childSessionId: null,
          subAgentName: subAgent.name,
          text: `[Sub-agent "${subAgent.name}" failed]: ${message}`,
        };
      }
    },
  });
}

/**
 * Execute a sub-agent by creating a child session and delegating to `runStream`.
 *
 * This intentionally reuses the same `runStream` path as primary agents so that
 * tool creation, MCP wiring, disabled-tool filtering, attachment transforms, and
 * the full step-loop are handled in one place.  The only sub-agent-specific work
 * here is creating the child session, seeding it with a user message, building the
 * initial conversation history, and reading back the final text once `runStream`
 * completes.
 */
async function executeSubAgent(opts: {
  subAgent: SubAgentWithConfig;
  task: string;
  additionalContext?: string;
  parentContext: SubAgentToolContext;
  abortSignal: AbortSignal;
  onChildSessionCreated: (childSessionId: PrefixedString<'ses'>) => Promise<void>;
}): Promise<{ text: string; childSessionId: PrefixedString<'ses'> }> {
  const { subAgent, task, additionalContext, parentContext, abortSignal, onChildSessionCreated } = opts;
  const db = getDb();

  // 0. Resolve provider/model (override or parent fallback)
  const { credentials, modelId } = await resolveSubAgentProvider(subAgent, parentContext);

  // 1. Create child session
  const childSessionId = createSessionId();
  const now = Date.now();

  await db.insert(sessions).values({
    id: childSessionId,
    title: `[${subAgent.name}] ${task.slice(0, 80)}`,
    parentSessionId: parentContext.sessionId,
    createdAt: now,
    updatedAt: now,
  });

  // Notify the parent stream that the child session is live so the UI can navigate to it
  await onChildSessionCreated(childSessionId);

  // 2. Build the sub-agent's system prompt
  let systemPrompt = subAgent.systemPrompt ?? '';
  if (additionalContext) {
    systemPrompt = systemPrompt
      ? `${systemPrompt}\n\n--- Additional Context from Parent Agent ---\n${additionalContext}`
      : additionalContext;
  }

  // 3. Create a user message with the task
  const userMessageId = createMessageId();
  await db.insert(messages).values({
    id: userMessageId,
    sessionId: childSessionId,
    role: 'user',
    parts: [
      {
        type: 'text-delta' as const,
        id: createPartId(),
        text: task,
        startedAt: now,
        endedAt: now,
      },
    ],
    modelId,
    providerId: credentials.providerId,
    agentId: subAgent.id,
    costUsd: 0,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    duration: null,
  });

  // 4. Build conversation history for the child session
  const llmMessages = await buildCompactedHistory(childSessionId, {
    useBasePrompt: subAgent.useBasePrompt,
    systemPrompt,
  });

  // 5. Delegate to runStream — it handles tool creation, MCP, disabled-tool
  //    filtering, attachment transforms, and the full step-loop.
  const assistantMessageId = createMessageId();

  await runStream({
    sessionId: childSessionId,
    assistantMessageId,
    modelId,
    agentId: subAgent.id,
    llmMessages,
    credentials,
    abortSignal,
    subAgentId: subAgent.id,
  });

  // 6. Extract the assistant's final text response
  const [assistantMsg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, assistantMessageId));

  let resultText = '';
  if (assistantMsg) {
    const textParts = assistantMsg.parts.filter(
      (p) => p.type === 'text-delta' && typeof p.text === 'string',
    );
    resultText = textParts.map((p) => (p as { text: string }).text).join('');
  }

  return { text: resultText, childSessionId };
}

/**
 * Create sub-agent tools for a primary agent.
 * Returns an object mapping tool names to their tool definitions.
 * Only primary agents get sub-agent tools; sub-agents skip this (single-level nesting).
 */
export async function createSubAgentTools(
  agentId: PrefixedString<'agt'>,
  parentContext: SubAgentToolContext,
): Promise<Record<string, Tool>> {
  let agent: { type: string } | undefined;
  try {
    const db = getDb();
    const rows = await db.select().from(agents).where(eq(agents.id, agentId));
    agent = rows[0];
  } catch {
    // In test environments where the DB is not initialized, skip sub-agent tools
    return {};
  }

  // Only primary agents can have sub-agents
  if (!agent || agent.type !== 'primary') {
    return {};
  }

  const subAgents = await getAgentSubAgents(agentId);
  if (subAgents.length === 0) {
    return {};
  }

  const tools: Record<string, Tool> = {};
  for (const subAgent of subAgents) {
    const name = `subagent_${sanitizeToolName(subAgent.name)}`;
    tools[name] = createSubAgentTool(subAgent, parentContext);
  }

  log.info(
    {
      event: 'subagent.tools.created',
      agentId,
      subAgentCount: subAgents.length,
      toolNames: Object.keys(tools),
    },
    'sub-agent tools created',
  );

  return tools;
}
