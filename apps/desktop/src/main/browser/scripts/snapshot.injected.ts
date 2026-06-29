import { DOM_HELPERS_SCRIPT } from './dom-helpers.injected.js';

export function buildSnapshotScript(previousSnapshotIdentities: string[]): string {
  return String.raw`
(() => {
  let refCounter = 0;
  const refs = {};
  const lines = [];
  const maxVisitedNodes = 10000;
  const maxRenderedNodes = 450;
  const maxTextLength = 140;
  const viewportMargin = 120;
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

  function directText(el) {
    return Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || '')
      .join(' ')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, maxTextLength);
  }

  function normalizedValue(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return el.value || '';
    if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return (el.innerText || el.textContent || '').trim().slice(0, maxTextLength);
    return el.getAttribute('aria-valuetext') || el.getAttribute('aria-valuenow') || '';
  }

  function ariaAttributes(el) {
    return Array.from(el.attributes)
      .filter((attr) => attr.name.startsWith('aria-') && attr.value)
      .slice(0, 8)
      .map((attr) => attr.name + '=' + JSON.stringify(attr.value));
  }

  function isDisabled(el) {
    return Boolean(el.disabled || el.closest('[disabled], [aria-disabled="true"], [inert]'));
  }

  function isScrollable(el) {
    const style = getComputedStyle(el);
    const overflow = style.overflow + style.overflowX + style.overflowY;
    return /(auto|scroll)/.test(overflow) && (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2);
  }

  function occluded(el, rect) {
    if (!inViewport(rect, 0) || rect.width <= 0 || rect.height <= 0) return false;
    const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
    const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
    const top = document.elementFromPoint(x, y);
    return Boolean(top && top !== el && !el.contains(top) && !top.contains(el));
  }

  function interactable(el) {
    const tag = el.tagName.toLowerCase();
    const r = role(el);
    return ['a', 'button', 'input', 'textarea', 'select', 'summary', 'option'].includes(tag) || ['button', 'link', 'tab', 'menuitem', 'checkbox', 'radio', 'combobox', 'textbox', 'switch'].includes(r) || el.hasAttribute('onclick') || el.hasAttribute('tabindex') || (el.isContentEditable && el.getAttribute('contenteditable') !== null) || getComputedStyle(el).cursor === 'pointer';
  }

  function inViewport(rect, margin = viewportMargin) {
    return rect.bottom > -margin && rect.right > -margin && rect.top < window.innerHeight + margin && rect.left < window.innerWidth + margin;
  }

  function meaningfulName(el, r, isTarget) {
    if (isTarget || r !== 'generic') return name(el);
    return '';
  }

  function hasInteractiveAncestor(el) {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      if (interactable(node)) return true;
    }
    return false;
  }

  function walk(el, depth, context) {
    if (!el || count > maxVisitedNodes || lines.length > maxRenderedNodes || el.nodeType !== 1) return;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'template', 'meta', 'link', 'head'].includes(tag)) return;
    if (!visible(el) && tag !== 'body' && tag !== 'html') return;

    count++;
    const r = role(el);
    const baseTarget = interactable(el);
    const isNestedTarget = baseTarget && hasInteractiveAncestor(el);
    const isTarget = baseTarget && !isNestedTarget;
    const label = meaningfulName(el, r, isTarget);
    const text = label || directText(el);
    const elementIdentity = identity(el, r, label);
    const rect = el.getBoundingClientRect();
    const isInViewport = inViewport(rect, 0);
    const isNearViewport = inViewport(rect);
    const isOccluded = occluded(el, rect);
    const canReference = context === 'document' || context === 'shadow';
    currentIdentities.add(elementIdentity);
    let ref = null;
    if (isTarget && canReference && isInViewport && !isOccluded) {
      refCounter++;
      ref = 'e' + refCounter;
      refs[ref] = {
        selector: cssPath(el),
        tag,
        role: r,
        name: label,
        identity: elementIdentity,
        inViewport: isInViewport,
        x: Math.round(rect.left + rect.width / 2),
        y: Math.round(rect.top + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      };
    }
    const shouldEmit = isNearViewport && (isTarget || text || r !== 'generic' || tag === 'iframe' || isScrollable(el));
    if (shouldEmit) {
      const attrs = [];
      if (ref) attrs.push('ref=' + ref);
      if (isInViewport) attrs.push('viewport');
      if (hasPreviousSnapshot && !previousIdentities.has(elementIdentity)) attrs.push('new');
      attrs.push('box=' + Math.round(rect.left) + ',' + Math.round(rect.top) + ',' + Math.round(rect.width) + 'x' + Math.round(rect.height));
      if (context === 'shadow') attrs.push('shadow');
      if (context === 'iframe') attrs.push('iframe');
      if (isScrollable(el)) attrs.push('scrollable');
      if (isDisabled(el)) attrs.push('disabled');
      if (isOccluded) attrs.push('occluded');
      if (el.checked) attrs.push('checked');
      if (el.selected) attrs.push('selected');
      if (el.required) attrs.push('required');
      if (el.getAttribute('aria-expanded')) attrs.push('expanded=' + el.getAttribute('aria-expanded'));
      const value = normalizedValue(el).slice(0, 80);
      if (value) attrs.push('value=' + JSON.stringify(value));
      if (el.getAttribute('placeholder')) attrs.push('placeholder=' + JSON.stringify(el.getAttribute('placeholder')));
      attrs.push(...ariaAttributes(el));
      const suffix = attrs.length ? ' [' + attrs.join(' ') + ']' : '';
      lines.push('  '.repeat(depth) + '- ' + r + (text ? ' ' + JSON.stringify(text) : '') + suffix);
    }

    if (tag === 'iframe') {
      try {
        const frameDocument = el.contentDocument;
        if (frameDocument?.body) {
          lines.push('  '.repeat(depth + 1) + '- iframe-document ' + JSON.stringify(el.getAttribute('src') || el.src || ''));
          walk(frameDocument.body, depth + 2, 'iframe');
        }
      } catch {
        lines.push('  '.repeat(depth + 1) + '- iframe-document "cross-origin"');
      }
    }

    if (el.shadowRoot) {
      lines.push('  '.repeat(depth + 1) + '- shadow-root');
      for (const child of Array.from(el.shadowRoot.children)) walk(child, depth + 2, 'shadow');
    }
    for (const child of Array.from(el.children)) walk(child, depth + 1, context);
  }

  walk(document.body || document.documentElement, 0, 'document');
  return {
    url: location.href,
    title: document.title,
    tree: lines.join('\n'),
    refs,
    identities: Array.from(currentIdentities),
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      deviceScaleFactor: window.devicePixelRatio,
    },
    scroll: {
      scrollTop: window.scrollY,
      scrollLeft: window.scrollX,
      scrollHeight: document.documentElement.scrollHeight,
      scrollWidth: document.documentElement.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      pagesAbove: Math.floor(window.scrollY / Math.max(window.innerHeight, 1)),
      pagesBelow: Math.ceil((document.documentElement.scrollHeight - window.scrollY - window.innerHeight) / Math.max(window.innerHeight, 1)),
    },
  };
})()
`;
}
