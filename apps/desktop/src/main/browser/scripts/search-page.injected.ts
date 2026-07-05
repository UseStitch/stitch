import type { ElectronBrowserCommand } from '@stitch/shared/browser/electron';

export function buildSearchPageScript(command: Extract<ElectronBrowserCommand, { action: 'searchPage' }>): string {
  return `(() => {
    const text = (document.querySelector(${JSON.stringify(command.cssScope ?? 'body')})?.innerText || '');
    const pattern = ${JSON.stringify(command.pattern)};
    const contextChars = ${command.contextChars ?? 80};
    const maxResults = ${command.maxResults ?? 20};
    const matches = [];
    if (${command.regex ? 'true' : 'false'}) {
      const re = new RegExp(pattern, ${JSON.stringify(command.caseSensitive ? 'g' : 'gi')});
      let match;
      while ((match = re.exec(text)) && matches.length < maxResults) {
        matches.push({ match: match[0], index: match.index, context: text.slice(Math.max(0, match.index - contextChars), match.index + match[0].length + contextChars) });
        if (match[0] === '') re.lastIndex++;
      }
      return { matches, total: matches.length };
    }
    const haystack = ${command.caseSensitive ? 'text' : 'text.toLowerCase()'};
    const needle = ${command.caseSensitive ? 'pattern' : 'pattern.toLowerCase()'};
    let index = haystack.indexOf(needle);
    while (index !== -1 && matches.length < maxResults) {
      matches.push({ match: text.slice(index, index + pattern.length), index, context: text.slice(Math.max(0, index - contextChars), index + pattern.length + contextChars) });
      index = haystack.indexOf(needle, index + Math.max(pattern.length, 1));
    }
    return { matches, total: matches.length };
  })()`;
}
