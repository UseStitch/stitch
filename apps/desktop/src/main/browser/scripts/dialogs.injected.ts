export const DIALOG_SIGNAL = '__stitch_dialog__';

export const DIALOG_INTERCEPT_SCRIPT = `(() => {
  if (window.__stitchDialogsInstalled) return;
  window.__stitchDialogsInstalled = true;

  function notify(type, message, defaultPromptText) {
    console.info(${JSON.stringify(DIALOG_SIGNAL)} + JSON.stringify({
      type,
      message: String(message || ''),
      defaultPromptText: String(defaultPromptText || ''),
      url: location.href,
    }));
  }

  window.alert = (message) => {
    notify('alert', message, '');
  };

  window.confirm = (message) => {
    notify('confirm', message, '');
    return false;
  };

  window.prompt = (message, defaultValue = '') => {
    notify('prompt', message, defaultValue);
    return null;
  };
})()`;
