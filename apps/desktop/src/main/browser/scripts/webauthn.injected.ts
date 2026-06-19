export const WEBAUTHN_SIGNAL = '__stitch_webauthn_request__';

/**
 * Script injected into the webview to detect WebAuthn/passkey calls.
 * When navigator.credentials.create/get is called with publicKey options,
 * we notify the main process via a console message so it can open the page
 * in the system browser.
 */
export const WEBAUTHN_INTERCEPT_SCRIPT = String.raw`
  if (window.__stitchWebAuthnPatched) { /* already patched */ } else {
    window.__stitchWebAuthnPatched = true;
    const origCreate = navigator.credentials?.create?.bind(navigator.credentials);
    const origGet = navigator.credentials?.get?.bind(navigator.credentials);

    function notifyMainProcess() {
      console.log('${WEBAUTHN_SIGNAL}' + location.href);
    }

    function patchedCreate(options) {
      if (options?.publicKey) {
        notifyMainProcess();
        return Promise.reject(new DOMException(
          'Passkeys are not supported in this browser. The page has been opened in your system browser.',
          'NotAllowedError'
        ));
      }
      return origCreate?.(options) ?? Promise.reject(new DOMException('Not supported', 'NotSupportedError'));
    }

    function patchedGet(options) {
      if (options?.publicKey) {
        notifyMainProcess();
        return Promise.reject(new DOMException(
          'Passkeys are not supported in this browser. The page has been opened in your system browser.',
          'NotAllowedError'
        ));
      }
      return origGet?.(options) ?? Promise.reject(new DOMException('Not supported', 'NotSupportedError'));
    }

    if (navigator.credentials) {
      Object.defineProperty(navigator.credentials, 'create', { value: patchedCreate, writable: false, configurable: true });
      Object.defineProperty(navigator.credentials, 'get', { value: patchedGet, writable: false, configurable: true });
    }
  }
`;
