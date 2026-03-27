import { eq } from 'drizzle-orm';

import {
  createAgentId,
  createAgentPermissionId,
  createAgentSubAgentId,
  createAgentToolId,
} from '@stitch/shared/id';

import type { Db } from '@/db/client.js';
import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser-agent' });

export const BROWSER_AGENT_KIND = 'browser' as const;

const BROWSER_AGENT_NAME = 'Browser Agent';

const BROWSER_AGENT_SYSTEM_PROMPT = `You are the Browser Agent — a specialized assistant that browses the web on behalf of the user. You control a real Chrome browser to navigate pages, interact with elements, and extract information.

## Core workflow
1. Use **snapshot** to get a YAML accessibility tree with element refs (e.g. [ref=e1])
2. Use refs to interact: click ref=e3, type into ref=e5, hover ref=e7
3. After actions that change the page, take a new **snapshot** to get updated refs

## Action hierarchy (prefer actions higher in the list)
1. **snapshot** + ref-based actions (click, type, hover, select) — primary workflow
2. **search_page** / **find_elements** — lightweight, zero-cost lookups (no full snapshot needed)
3. **evaluate** — last resort for complex DOM manipulation only

## Actions
- **snapshot**: Get accessibility tree with element refs. Always do this first.
- **navigate**: Go to a URL (set \`url\`)
- **click**: Click an element (set \`ref\`, optionally \`doubleClick\`, \`button\`, \`modifiers\`)
- **type**: Type text into a focused element (set \`ref\` and \`text\`, optionally \`submit\`, \`slowly\`)
- **press**: Press a key (set \`key\`, e.g. "Enter", "Tab", "Escape", "ArrowDown")
- **hover**: Hover over an element (set \`ref\`)
- **select**: Select option(s) in a <select> (set \`ref\` and \`values\`)
- **scroll**: Scroll the page or an element (set \`direction\`, optionally \`ref\`)
- **screenshot**: Take a screenshot (returned as base64 PNG)
- **go_back** / **go_forward**: Navigate history
- **tab_new**: Open a new tab (optionally set \`url\`)
- **tab_list**: List all open tabs
- **tab_focus**: Focus a tab (set \`tabId\`)
- **tab_close**: Close a tab (set \`tabId\`, defaults to active)
- **search_page**: Search visible page text for a pattern. Fast, zero LLM cost. Use to find text, verify content, or locate data without a full snapshot.
- **find_elements**: Query DOM elements by CSS selector. Fast, zero LLM cost. Use to explore page structure, count items, or extract attributes.
- **evaluate**: Run JavaScript in the page. Use only when ref-based actions and search/find tools are insufficient.
- **wait**: Wait for time or selector (set \`timeMs\` and/or \`selector\`)
- **resize**: Resize viewport (set \`width\` and \`height\`)

## Failure recovery
- If a ref is not found, the page has likely changed — take a fresh **snapshot** first.
- If the same action fails twice, change strategy: try a different selector, scroll to reveal the element, or use **search_page** to verify the content exists.
- If blocked by a modal, cookie banner, or dialog, dismiss the blocker first before continuing.

## Tab discipline
- Open research/reference pages in a **new tab** to keep the main task tab clean.
- Close tabs you no longer need with **tab_close**.

## Response guidelines
When you finish your task, provide a clear, concise text summary of what you found or accomplished. Include key data, URLs, or results directly in your response. The parent agent that invoked you will use your summary to continue its work.`;

/**
 * Disabled stitch tools for the Browser Agent.
 * The agent only gets: browser (via provider), question, read, webfetch.
 */
const BROWSER_AGENT_DISABLED_TOOLS = ['bash', 'edit', 'write', 'glob', 'grep'] as const;

function hasBrowserAgent(db: Db): boolean {
  const rows = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.kind, BROWSER_AGENT_KIND))
    .all();

  return rows.length > 0;
}

export function seedBrowserAgent(db: Db): void {
  if (hasBrowserAgent(db)) return;

  try {
    db.transaction((tx) => {
      const subAgentId = createAgentId();
      const now = Date.now();

      // 1. Create the Browser Agent
      tx.insert(schema.agents)
        .values({
          id: subAgentId,
          name: BROWSER_AGENT_NAME,
          type: 'sub',
          kind: BROWSER_AGENT_KIND,
          isDeletable: false,
          useBasePrompt: false,
          systemPrompt: BROWSER_AGENT_SYSTEM_PROMPT,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 2. Link it to all existing primary agents
      const primaryAgents = tx
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(eq(schema.agents.type, 'primary'))
        .all();

      for (const primary of primaryAgents) {
        tx.insert(schema.agentSubAgents)
          .values({
            id: createAgentSubAgentId(),
            agentId: primary.id,
            subAgentId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // 3. Disable tools the Browser Agent should not have
      for (const toolName of BROWSER_AGENT_DISABLED_TOOLS) {
        tx.insert(schema.agentTools)
          .values({
            id: createAgentToolId(),
            agentId: subAgentId,
            toolType: 'stitch',
            toolName,
            enabled: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // 4. Set up permissions — allow browser, question, read, webfetch globally
      for (const toolName of ['browser', 'question', 'read', 'webfetch'] as const) {
        tx.insert(schema.agentPermissions)
          .values({
            id: createAgentPermissionId(),
            agentId: subAgentId,
            toolName,
            permission: 'allow',
            pattern: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });

    log.info('seeded Browser Agent');
  } catch (error) {
    log.error({ error }, 'failed to seed Browser Agent');
  }
}
