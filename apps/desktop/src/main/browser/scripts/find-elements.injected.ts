import type { ElectronBrowserCommand } from '@stitch/shared/browser/electron';

export function buildFindElementsScript(
  command: Extract<ElectronBrowserCommand, { action: 'findElements' }>,
): string {
  return `(() => { const nodes = Array.from(document.querySelectorAll(${JSON.stringify(command.selector)})); const attrs = ${JSON.stringify(command.attributes ?? [])}; const includeText = ${command.includeText !== false}; const elements = nodes.slice(0, ${command.maxResults ?? 20}).map((el) => ({ tag: el.tagName.toLowerCase(), text: includeText ? (el.innerText || el.textContent || '').trim().slice(0, 200) : undefined, attributes: Object.fromEntries(attrs.map((name) => [name, el.getAttribute(name) || '']).filter(([, value]) => value)) })); return { elements, total: nodes.length }; })()`;
}
