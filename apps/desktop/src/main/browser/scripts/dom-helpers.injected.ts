export const DOM_HELPERS_SCRIPT = String.raw`
function visible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  for (let node = el; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    if (node.hasAttribute('hidden') || node.hasAttribute('inert')) return false;
    if (node.getAttribute('aria-hidden') === 'true') return false;
  }
  return true;
}

function role(el) {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  if (tag === 'button') return 'button';
  if (tag === 'input') return ['checkbox', 'radio', 'button', 'submit'].includes(el.type) ? el.type : 'textbox';
  if (tag === 'textarea') return 'textbox';
  if (tag === 'select') return 'combobox';
  if (tag === 'option') return 'option';
  if (tag === 'summary') return 'button';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'img') return 'img';
  if (tag === 'svg') return 'img';
  if (el.isContentEditable && el.getAttribute('contenteditable') !== null) return 'textbox';
  return 'generic';
}

function name(el) {
  return el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
}

function identity(el, r, label) {
  const tag = el.tagName.toLowerCase();
  return [tag, r, label, el.id || '', el.getAttribute('href') || '', el.getAttribute('type') || '', el.getAttribute('name') || '', el.getAttribute('data-testid') || '', el.getAttribute('aria-label') || ''].join('|');
}
`;
