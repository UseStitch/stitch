declare const __APP_VERSION__: string;

declare namespace React.JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      partition?: string;
      useragent?: string;
    };
  }
}
