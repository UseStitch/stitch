import type { RefResolver } from './ref-resolver.js';
import type { WebContents } from 'electron';

const DEFAULT_SCROLL_PX = 650;
const SELECT_CHANGE_DELAY_MS = 10;
const CONTENTEDITABLE_CHAR_DELAY_MS = 5;
const FOCUS_SETTLE_MS = 50;

export async function clickRef(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
  doubleClick?: boolean,
  button: string = 'left',
  modifiers?: string[],
): Promise<void> {
  const target = await refResolver.resolveRef(ref);
  const mouseButton = button === 'right' || button === 'middle' ? button : 'left';
  const inputModifiers = normalizeModifiers(modifiers);
  browser.sendInputEvent({
    type: 'mouseMove',
    x: target.x,
    y: target.y,
    modifiers: inputModifiers,
  });
  browser.sendInputEvent({
    type: 'mouseDown',
    x: target.x,
    y: target.y,
    button: mouseButton,
    clickCount: 1,
    modifiers: inputModifiers,
  });
  browser.sendInputEvent({
    type: 'mouseUp',
    x: target.x,
    y: target.y,
    button: mouseButton,
    clickCount: 1,
    modifiers: inputModifiers,
  });
  if (doubleClick) {
    browser.sendInputEvent({
      type: 'mouseDown',
      x: target.x,
      y: target.y,
      button: mouseButton,
      clickCount: 2,
      modifiers: inputModifiers,
    });
    browser.sendInputEvent({
      type: 'mouseUp',
      x: target.x,
      y: target.y,
      button: mouseButton,
      clickCount: 2,
      modifiers: inputModifiers,
    });
  }
}

export async function hoverRef(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
): Promise<void> {
  const target = await refResolver.resolveRef(ref);
  browser.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
}

export async function typeIntoRef(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
  text: string,
  clear?: boolean,
  submit?: boolean,
  slowly?: boolean,
): Promise<void> {
  const isContentEditable = await refResolver.runOnRef<boolean>(
    ref,
    (element) =>
      `return ${element}.isContentEditable || ${element}.getAttribute('contenteditable') !== null`,
  );

  if (isContentEditable) {
    await typeIntoContentEditable(browser, refResolver, ref, text, clear, submit, slowly);
  } else {
    await refResolver.focusRef(ref);
    await new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS));
    if (clear) {
      sendShortcut(browser, 'A');
      sendKey(browser, 'Backspace');
    }
    if (slowly) {
      for (const char of text) {
        await browser.insertText(char);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    } else {
      await browser.insertText(text);
    }
    if (submit) {
      sendKey(browser, 'Enter');
    }
  }
}

async function typeIntoContentEditable(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
  text: string,
  clear?: boolean,
  submit?: boolean,
  slowly?: boolean,
): Promise<void> {
  // Click the element to activate the rich text editor framework
  const target = await refResolver.resolveRef(ref);
  browser.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
  browser.sendInputEvent({
    type: 'mouseDown',
    x: target.x,
    y: target.y,
    button: 'left',
    clickCount: 1,
  });
  browser.sendInputEvent({
    type: 'mouseUp',
    x: target.x,
    y: target.y,
    button: 'left',
    clickCount: 1,
  });
  await new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS));

  if (clear) {
    sendShortcut(browser, 'A');
    await new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS));
    sendKey(browser, 'Backspace');
    await new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS));
  }

  // Type character-by-character using key events for contenteditable compatibility
  const delay = slowly ? 20 : CONTENTEDITABLE_CHAR_DELAY_MS;
  for (const char of text) {
    if (char === '\n') {
      sendKey(browser, 'Enter');
    } else {
      browser.sendInputEvent({ type: 'keyDown', keyCode: char });
      browser.sendInputEvent({ type: 'char', keyCode: char });
      browser.sendInputEvent({ type: 'keyUp', keyCode: char });
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  // Dispatch input event to trigger framework reactivity
  await refResolver.runOnRef(
    ref,
    (element) => `${element}.dispatchEvent(new Event('input', { bubbles: true })); return true;`,
  );

  if (submit) {
    sendKey(browser, 'Enter');
  }
}

export async function selectRef(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
  values: string[],
): Promise<void> {
  if (
    values.length === 1 &&
    (await selectSingleValueWithKeyboard(browser, refResolver, ref, values[0]))
  ) {
    return;
  }

  await refResolver.runOnRef(
    ref,
    (element) =>
      `for (const option of ${element}.options || []) option.selected = ${JSON.stringify(values)}.includes(option.value) || ${JSON.stringify(values)}.includes(option.textContent?.trim()); ${element}.dispatchEvent(new Event('input', { bubbles: true })); ${element}.dispatchEvent(new Event('change', { bubbles: true })); return true;`,
  );
}

export async function scroll(
  browserGetter: () => Promise<WebContents>,
  refResolver: RefResolver,
  ref: string | undefined,
  direction: 'up' | 'down' | 'left' | 'right',
): Promise<void> {
  const delta = direction === 'up' || direction === 'left' ? -DEFAULT_SCROLL_PX : DEFAULT_SCROLL_PX;
  if (ref) {
    await refResolver.runOnRef(
      ref,
      (element) =>
        `${element}.scrollBy(${direction === 'left' || direction === 'right' ? delta : 0}, ${direction === 'up' || direction === 'down' ? delta : 0}); return true;`,
    );
    return;
  }
  await (
    await browserGetter()
  ).executeJavaScript(
    `window.scrollBy(${direction === 'left' || direction === 'right' ? delta : 0}, ${direction === 'up' || direction === 'down' ? delta : 0})`,
    true,
  );
}

function sendKey(browser: WebContents, keyCode: string): void {
  browser.sendInputEvent({ type: 'keyDown', keyCode });
  browser.sendInputEvent({ type: 'keyUp', keyCode });
}

function sendShortcut(browser: WebContents, keyCode: string): void {
  const modifier = process.platform === 'darwin' ? 'meta' : 'control';
  browser.sendInputEvent({ type: 'keyDown', keyCode, modifiers: [modifier] });
  browser.sendInputEvent({ type: 'keyUp', keyCode, modifiers: [modifier] });
}

function normalizeModifiers(
  modifiers: string[] | undefined,
): Array<'shift' | 'control' | 'alt' | 'meta'> {
  const allowed = new Set(['shift', 'control', 'alt', 'meta']);
  return (modifiers ?? [])
    .map((modifier) => modifier.toLowerCase())
    .filter((modifier): modifier is 'shift' | 'control' | 'alt' | 'meta' => allowed.has(modifier));
}

async function selectSingleValueWithKeyboard(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
  value: string,
): Promise<boolean> {
  const result = await refResolver.runOnRef<{ usable: boolean; targetIndex?: number }>(
    ref,
    (element) => `
      if (${element}.tagName?.toLowerCase() !== 'select' || ${element}.multiple) return { usable: false };
      const options = Array.from(${element}.options || []);
      const targetIndex = options.findIndex((option) => option.value === ${JSON.stringify(value)} || option.textContent?.trim() === ${JSON.stringify(value)});
      if (targetIndex < 0) return { usable: false };
      ${element}.scrollIntoView({ block: 'center', inline: 'center' });
      ${element}.focus();
      return { usable: true, targetIndex };
    `,
  );

  if (!result.usable || typeof result.targetIndex !== 'number') {
    return false;
  }

  sendKey(browser, 'Home');
  await new Promise((resolve) => setTimeout(resolve, SELECT_CHANGE_DELAY_MS));
  for (let i = 0; i < result.targetIndex; i++) {
    sendKey(browser, 'ArrowDown');
    await new Promise((resolve) => setTimeout(resolve, SELECT_CHANGE_DELAY_MS));
  }
  sendKey(browser, 'Enter');
  return true;
}
