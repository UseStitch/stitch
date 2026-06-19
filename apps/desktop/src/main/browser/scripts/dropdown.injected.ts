export function buildGetDropdownOptionsScript(element: string): string {
  return `
    const dropdown = findDropdown(${element});
    if (!dropdown) return { type: 'unknown', options: [] };
    return getDropdownOptions(dropdown);

    function visible(node) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    function findDropdown(node) {
      if (isDropdown(node)) return node;
      return node.querySelector?.('select,[role="combobox"],[role="listbox"],[role="menu"],[aria-haspopup="listbox"],[aria-haspopup="menu"]') || null;
    }

    function isDropdown(node) {
      const role = node.getAttribute?.('role');
      return node.tagName?.toLowerCase() === 'select' || role === 'combobox' || role === 'listbox' || role === 'menu' || node.hasAttribute?.('aria-haspopup');
    }

    function optionText(node) {
      return (node.innerText || node.textContent || node.getAttribute('aria-label') || '').trim().replace(/s+/g, ' ');
    }

    function getDropdownOptions(node) {
      if (node.tagName.toLowerCase() === 'select') {
        return {
          type: 'select',
          options: Array.from(node.options).map((option, index) => ({
            index,
            text: option.text.trim(),
            value: option.value,
            selected: option.selected,
            disabled: option.disabled,
          })),
        };
      }

      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      node.click?.();
      const controlled = node.getAttribute('aria-controls');
      const scope = controlled ? document.getElementById(controlled) || document : document;
      const options = Array.from(scope.querySelectorAll('[role="option"],[role="menuitem"],option,li,button'))
        .filter((option) => visible(option) && optionText(option))
        .slice(0, 200)
        .map((option, index) => ({
          index,
          text: optionText(option),
          value: option.getAttribute('value') || option.getAttribute('data-value') || optionText(option),
          selected: option.getAttribute('aria-selected') === 'true' || option.classList.contains('selected') || option.classList.contains('active'),
          disabled: option.hasAttribute('disabled') || option.getAttribute('aria-disabled') === 'true',
        }));
      return { type: 'custom', options };
    }
  `;
}

export function buildSelectDropdownScript(element: string, text: string): string {
  return `
    const wanted = ${JSON.stringify(text)};
    const dropdown = findDropdown(${element});
    if (!dropdown) return { selected: false, error: 'Dropdown not found' };
    return selectDropdown(dropdown, wanted);

    function normalize(value) {
      return String(value || '').trim().replace(/s+/g, ' ').toLowerCase();
    }

    function visible(node) {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    }

    function findDropdown(node) {
      if (isDropdown(node)) return node;
      return node.querySelector?.('select,[role="combobox"],[role="listbox"],[role="menu"],[aria-haspopup="listbox"],[aria-haspopup="menu"]') || null;
    }

    function isDropdown(node) {
      const role = node.getAttribute?.('role');
      return node.tagName?.toLowerCase() === 'select' || role === 'combobox' || role === 'listbox' || role === 'menu' || node.hasAttribute?.('aria-haspopup');
    }

    function optionText(node) {
      return (node.innerText || node.textContent || node.getAttribute('aria-label') || '').trim().replace(/s+/g, ' ');
    }

    function matches(node) {
      const target = normalize(wanted);
      const text = normalize(optionText(node));
      const value = normalize(node.value || node.getAttribute('value') || node.getAttribute('data-value'));
      return text === target || value === target || text.includes(target);
    }

    function dispatchChange(node) {
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      node.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function selectDropdown(node, wantedText) {
      if (node.tagName.toLowerCase() === 'select') {
        const option = Array.from(node.options).find(matches);
        if (!option) return { selected: false, error: 'Option not found' };
        node.value = option.value;
        option.selected = true;
        node.selectedIndex = option.index;
        dispatchChange(node);
        return { selected: true, text: option.text.trim(), value: option.value, index: option.index };
      }

      node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      node.click?.();
      const controlled = node.getAttribute('aria-controls');
      const scope = controlled ? document.getElementById(controlled) || document : document;
      const option = Array.from(scope.querySelectorAll('[role="option"],[role="menuitem"],option,li,button'))
        .filter((candidate) => visible(candidate) && optionText(candidate))
        .find(matches);
      if (!option) return { selected: false, error: 'Option not found' };
      option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      option.click?.();
      option.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      return { selected: true, text: optionText(option), value: option.getAttribute('value') || option.getAttribute('data-value') || optionText(option) };
    }
  `;
}
