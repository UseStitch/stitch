const SEPARATOR = ':::';

export function parseModelId(model: string): { providerId: string; modelId: string } | null {
  const [providerId, modelId] = model.split(SEPARATOR);
  if (!providerId || !modelId) return null;
  return { providerId, modelId };
}
