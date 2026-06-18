export const DOM_HELPERS_SCRIPT = String.raw`
function visible(el) {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
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
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'img') return 'img';
  return 'generic';
}

function name(el) {
  return el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('placeholder') || el.innerText?.trim().replace(/\s+/g, ' ').slice(0, 100) || '';
}

function identity(el, r, label) {
  const tag = el.tagName.toLowerCase();
  return [tag, r, label, el.getAttribute('href') || '', el.getAttribute('type') || '', el.getAttribute('name') || ''].join('|');
}
`;
