import { DOM_HELPERS_SCRIPT } from './dom-helpers.injected.js';

export function buildSnapshotScript(previousSnapshotIdentities: string[]): string {
  return String.raw`
(() => {
  let refCounter = 0;
  const refs = {};
  const lines = [];
  const maxNodes = 3000;
  const previousIdentities = new Set(${JSON.stringify(previousSnapshotIdentities)});
  const hasPreviousSnapshot = previousIdentities.size > 0;
  const currentIdentities = new Set();
  let count = 0;

  ${DOM_HELPERS_SCRIPT}

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

  function interactable(el) {
    const tag = el.tagName.toLowerCase();
    const r = role(el);
    return ['a', 'button', 'input', 'textarea', 'select', 'summary'].includes(tag) || ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio'].includes(r) || el.hasAttribute('onclick') || el.hasAttribute('tabindex') || getComputedStyle(el).cursor === 'pointer';
  }

  function inViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function walk(el, depth) {
    if (!el || count > maxNodes || el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'meta', 'link', 'head', 'svg'].includes(tag)) return;
    if (!visible(el) && tag !== 'body' && tag !== 'html') return;

    count++;
    const r = role(el);
    const label = name(el);
    const isTarget = interactable(el);
    const elementIdentity = identity(el, r, label);
    const rect = el.getBoundingClientRect();
    const isInViewport = inViewport(rect);
    currentIdentities.add(elementIdentity);
    let ref = null;
    if (isTarget) {
      refCounter++;
      ref = 'e' + refCounter;
      refs[ref] = {
        selector: cssPath(el),
        tag,
        role: r,
        name: label,
        identity: elementIdentity,
        inViewport: isInViewport,
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
    if (isTarget || label || r !== 'generic') {
      const attrs = [];
      if (ref) attrs.push('ref=' + ref);
      if (isInViewport) attrs.push('viewport');
      if (hasPreviousSnapshot && !previousIdentities.has(elementIdentity)) attrs.push('new');
      if (el.disabled) attrs.push('disabled');
      const suffix = attrs.length ? ' [' + attrs.join(' ') + ']' : '';
      lines.push('  '.repeat(depth) + '- ' + r + (label ? ' ' + JSON.stringify(label) : '') + suffix);
    }
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  }

  walk(document.body || document.documentElement, 0);
  return {
    url: location.href,
    title: document.title,
    tree: lines.join('\n'),
    refs,
    identities: Array.from(currentIdentities),
    scroll: {
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      pagesAbove: Math.floor(window.scrollY / Math.max(window.innerHeight, 1)),
      pagesBelow: Math.ceil((document.documentElement.scrollHeight - window.scrollY - window.innerHeight) / Math.max(window.innerHeight, 1)),
    },
  };
})()
`;
}
