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

const libpdfInstruction: LibraryInstruction = {
  name: 'libpdf',
  sectionTitle: 'PDF Handling',
  guidelines: [
    'Use `libpdf` in code mode when a PDF must be parsed, merged, split, or manipulated from bytes.',
    'Load a PDF with `const pdf = await libpdf.PDF.load(bytes)` where `bytes` is a `Uint8Array`.',
    'Do not use `external_read` for PDFs; read the file bytes via `await import("node:fs/promises")` then wrap in `new Uint8Array(buffer)`.',
    'Extract text per-page: `const text = pdf.getPage(0).extractText()` (0-indexed).',
    'Merge multiple PDFs: `const merged = await libpdf.PDF.merge([bytes1, bytes2])`; save with `await merged.save()`.',
    'Split pages: `const part = await pdf.extractPages([0, 1, 2])`; save with `await part.save()`.',
    'If `extractText()` returns an empty string, report that the page has no extractable text instead of retrying.',
    'If you need detailed usage examples, load the `pdf` skill with the skill tool before writing code.',
  ],
};

const LIBRARY_INSTRUCTIONS: LibraryInstruction[] = [libpdfInstruction];

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
