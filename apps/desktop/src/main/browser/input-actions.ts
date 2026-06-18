import type { WebContents } from 'electron';

import type { RefResolver } from './ref-resolver.js';

const DEFAULT_SCROLL_PX = 650;

export async function clickRef(
  browser: WebContents,
  refResolver: RefResolver,
  ref: string,
  doubleClick?: boolean,
  button: string = 'left',
): Promise<void> {
  const target = await refResolver.resolveRef(ref);
  const mouseButton = button === 'right' || button === 'middle' ? button : 'left';
  browser.sendInputEvent({ type: 'mouseMove', x: target.x, y: target.y });
  browser.sendInputEvent({
    type: 'mouseDown',
    x: target.x,
    y: target.y,
    button: mouseButton,
    clickCount: 1,
  });
  browser.sendInputEvent({
    type: 'mouseUp',
    x: target.x,
    y: target.y,
    button: mouseButton,
    clickCount: 1,
  });
  if (doubleClick) {
    browser.sendInputEvent({
      type: 'mouseDown',
      x: target.x,
      y: target.y,
      button: mouseButton,
      clickCount: 2,
    });
    browser.sendInputEvent({
      type: 'mouseUp',
      x: target.x,
      y: target.y,
      button: mouseButton,
      clickCount: 2,
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
  await refResolver.focusRef(ref, clear);
  if (slowly) {
    for (const char of text) {
      await browser.insertText(char);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } else {
    await browser.insertText(text);
  }
  if (submit) {
    browser.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
    browser.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
  }
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
  await (await browserGetter()).executeJavaScript(
    `window.scrollBy(${direction === 'left' || direction === 'right' ? delta : 0}, ${direction === 'up' || direction === 'down' ? delta : 0})`,
    true,
  );
}
