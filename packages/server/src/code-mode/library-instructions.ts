/**
 * Each library available in the sandbox can provide custom instructions
 * that are injected into the code-mode system prompt. This keeps
 * library-specific guidance co-located and makes adding new libraries trivial.
 */
interface LibraryInstruction {
  /** Identifier matching the name used in the libraries array (e.g. 'pdfjs') */
  name: string;
  /** Markdown section title (rendered as ## heading) */
  sectionTitle: string;
  /** Bullet-point guidelines for the model when using this library */
  guidelines: string[];
}

const pdfjsInstruction: LibraryInstruction = {
  name: 'pdfjs',
  sectionTitle: 'PDF Handling',
  guidelines: [
    'Use `pdfjs` in code mode when a PDF must be parsed, summarized, or inspected from bytes/base64.',
    'Do not use `external_read` for PDFs; it only supports text files.',
    'Avoid sending a whole PDF/base64 string through one tool call if it may exceed message limits; read or produce smaller chunks.',
    'If `getTextContent()` returns no items, report that the PDF has no extractable text instead of retrying the same parse.',
  ],
};

const LIBRARY_INSTRUCTIONS: LibraryInstruction[] = [pdfjsInstruction];

/**
 * Render the unified libraries section. Lists all active libraries and
 * includes per-library guidelines for those that have custom instructions.
 */
export function buildLibrariesSection(activeLibraries: string[]): string {
  if (activeLibraries.length === 0) return '';

  const entries = activeLibraries.map((name) => {
    const instruction = LIBRARY_INSTRUCTIONS.find((lib) => lib.name === name);
    if (!instruction) {
      return `### \`${name}\``;
    }
    const bullets = instruction.guidelines.map((g) => `- ${g}`).join('\n');
    return `### \`${name}\` — ${instruction.sectionTitle}\n\n${bullets}`;
  });

  return `## Available Libraries

The following host-approved libraries are available as globals inside the sandbox:

${entries.join('\n\n')}`;
}
