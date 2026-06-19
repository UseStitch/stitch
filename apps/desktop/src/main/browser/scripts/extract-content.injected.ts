import type { ElectronBrowserCommand } from '@stitch/shared/browser/electron';

export function buildExtractContentScript(
  command: Extract<ElectronBrowserCommand, { action: 'extractPageContent' }>,
): string {
  return `(() => {
    const root = document.querySelector(${JSON.stringify(command.selector ?? 'body')}) || document.body || document.documentElement;
    const query = ${JSON.stringify(command.query ?? '')}.trim().toLowerCase();
    function normalize(text) {
      return (text || '').trim().replace(/\\s+/g, ' ');
    }
    function queryText() {
      if (!query) return normalize(root.innerText || '');
      const terms = query.split(/\\s+/).filter(Boolean);
      const nodes = Array.from(root.querySelectorAll('article,section,h1,h2,h3,h4,h5,h6,p,li,dt,dd,tr,[role="row"],[role="listitem"]'));
      const matches = nodes
        .map((node) => normalize(node.innerText || node.textContent || ''))
        .filter((text) => text && terms.every((term) => text.toLowerCase().includes(term)))
        .slice(0, 80);
      return matches.length > 0 ? matches.join('\n') : normalize(root.innerText || '');
    }
    const result = { text: queryText() };
    if (${command.includeLinks ? 'true' : 'false'}) {
      result.links = Array.from(root.querySelectorAll('a[href]')).slice(0, 200).map((link) => ({
        text: normalize(link.innerText || link.textContent || '').slice(0, 200),
        href: link.href,
      })).filter((link) => link.href);
    }
    if (${command.includeImages ? 'true' : 'false'}) {
      result.images = Array.from(root.querySelectorAll('img[src]')).slice(0, 200).map((image) => ({
        alt: image.getAttribute('alt') || '',
        src: image.currentSrc || image.src,
      })).filter((image) => image.src);
    }
    const outputSchema = ${JSON.stringify(command.outputSchema ?? null)};
    if (outputSchema && outputSchema.properties && typeof outputSchema.properties === 'object') {
      result.data = {};
      for (const key of Object.keys(outputSchema.properties)) {
        const selectorKey = CSS.escape(key);
        const candidate = root.querySelector('[itemprop="' + selectorKey + '"], [name="' + selectorKey + '"], #' + selectorKey + ', .' + selectorKey);
        if (candidate) {
          result.data[key] = (candidate.innerText || candidate.textContent || candidate.getAttribute('content') || candidate.getAttribute('value') || '').trim();
          continue;
        }
        const label = Array.from(root.querySelectorAll('label,dt,th,strong,b')).find((node) =>
          (node.innerText || node.textContent || '').trim().toLowerCase().replace(/[:*]$/, '') === key.toLowerCase()
        );
        const valueNode = label?.nextElementSibling;
        if (valueNode) result.data[key] = (valueNode.innerText || valueNode.textContent || '').trim();
      }
    }
    return result;
  })()`;
}
