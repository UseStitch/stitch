import type { STTAdapter } from '@/stt/adapter-iface.js';

const adapters = new Map<string, STTAdapter>();

export function registerAdapter(adapter: STTAdapter): void {
  adapters.set(adapter.providerId, adapter);
}

export function getAdapter(providerId: string): STTAdapter | null {
  return adapters.get(providerId) ?? null;
}
