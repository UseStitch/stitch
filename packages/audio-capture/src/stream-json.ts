export function createJsonLineBuffer() {
  let buffer = '';
  return {
    append(chunk: Buffer, onLine: (line: string) => void): void {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        onLine(trimmed);
      }
    },
    clear(): void {
      buffer = '';
    },
  };
}
