import type { ElectronBrowserCommand } from '@stitch/shared/browser/electron';

export function buildFindElementsScript(command: Extract<ElectronBrowserCommand, { action: 'findElements' }>): string {
  return `(() => {
  function cssPath(el) {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      const tag = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter((child) => child.tagName === node.tagName);
      const index = siblings.indexOf(node) + 1;
      parts.unshift(tag + ':nth-of-type(' + index + ')');
      node = parent;
    }
    return parts.length ? parts.join(' > ') : 'body';
  }
  const nodes = Array.from(document.querySelectorAll(${JSON.stringify(command.selector)}));
  const attrs = ${JSON.stringify(command.attributes ?? [])};
  const includeText = ${command.includeText !== false};
  const elements = nodes.slice(0, ${command.maxResults ?? 20}).map((el) => ({
    tag: el.tagName.toLowerCase(),
    text: includeText ? (el.innerText || el.textContent || '').trim().slice(0, 200) : undefined,
    attributes: Object.fromEntries(attrs.map((name) => [name, el.getAttribute(name) || '']).filter(([, value]) => value)),
    cssPath: cssPath(el),
  }));
  return { elements, total: nodes.length };
})()`;
}
