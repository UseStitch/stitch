import { generateTypeStubs } from '@/code-mode/bindings/type-generator.js';
import type { ToolBinding } from '@/code-mode/isolate/types.js';

export function buildCodeModeSystemPrompt(bindings: Record<string, ToolBinding>): string {
  const typeStubs = generateTypeStubs(bindings);

  const functionList = Object.values(bindings)
    .map((b) => `- \`${b.name}\`: ${b.description}`)
    .join('\n');

  const hasFunctions = Object.keys(bindings).length > 0;

  const functionsSection = hasFunctions
    ? `
## Available External Functions

The following functions are available as globals inside the sandbox:

${functionList}
`.trim()
    : '';

  const typeSection = hasFunctions
    ? `
## Type Definitions

\`\`\`typescript
${typeStubs}
\`\`\`
`.trim()
    : '';

  return `
---

## Code Mode: \`execute_typescript\`

You have access to an \`execute_typescript\` tool that runs TypeScript code in a secure sandbox. Use it sparingly to orchestrate multiple tool calls, transform data, or implement logic that would otherwise require many sequential steps.

### When to use \`execute_typescript\`

- When you need to call multiple tools and combine or transform their results
- When you need loops, conditionals, or data transformations across tool outputs
- When you want to parallelize independent tool calls with \`Promise.all\`
- When a single-step tool call is insufficient for the task

Do not use \`execute_typescript\` for:

- A small number of direct tool calls
- Straightforward search/read/modify flows you can complete directly
- Simple batching that does not require substantial branching or transformation
- Tasks that are already practical with normal tool calls in a few steps
- Any task completable in 3 or fewer direct tool calls — the overhead and failure surface are not worth it

### How it works

- Write TypeScript code with full type safety
- Call any available \`external_*\` function — these map directly to real tools
- Each \`external_*\` call may require user permission approval (just like regular tool calls)
- The sandbox has no filesystem, network, or Node.js access — only the \`external_*\` functions
- \`console.log\` output is captured and returned alongside the result
- Return a value to pass it back as the tool result

${functionsSection}

${typeSection}

### Usage rules

- Always \`await\` external function calls — they are all async
- Top-level \`return\` is supported — the sandbox wraps your code in an async function
- Do **not** use top-level \`export\` or \`import\` statements — no modules are available
- If you define a helper \`async function\`, you **must \`await\`** the call at the top level — returning an un-awaited Promise silently discards the result
- Do not assume any global variables exist other than \`console\` and the \`external_*\` functions
- External functions return \`Promise<unknown>\` — use type assertions if needed
- If \`execute_typescript\` fails once in the current run, do not retry it for the same task unless the error clearly indicates a code mistake you can fix. Fall back to direct tool calls instead.
- **Always return a structured object, not a plain string.** Include fields like \`found\`, \`processed\`, \`count\`, or \`ids\` so the result is unambiguous. A string like \`"No results found"\` is indistinguishable from a successful no-op — a structured return like \`{ found: 0, query: "...", processed: 0 }\` makes the outcome clear.
- **Include the intermediate data that led to the outcome.** If a search returned zero results, include the query and the raw result count in the return object so you can diagnose whether the query was wrong, not just that nothing was processed.

### Async patterns

**Correct — top-level await:**
\`\`\`typescript
const result = await external_read({ filePath: '/foo.txt' });
return result;
\`\`\`

**Correct — helper function, properly awaited:**
\`\`\`typescript
async function process() {
  const result = await external_read({ filePath: '/foo.txt' });
  return result;
}
return await process();
\`\`\`

**Wrong — un-awaited helper call loses the result:**
\`\`\`typescript
async function process() { ... }
process(); // missing await — result is silently lost
\`\`\`

### Example

\`\`\`typescript
// Read two files and compare them
const [fileA, fileB] = await Promise.all([
  external_read({ filePath: '/path/to/a.txt' }),
  external_read({ filePath: '/path/to/b.txt' }),
]);

const aLines = (fileA as string).split('\\n').length;
const bLines = (fileB as string).split('\\n').length;

return {
  fileALines: aLines,
  fileBLines: bLines,
  difference: Math.abs(aLines - bLines),
};
\`\`\`
`.trim();
}
