import type { ModelSummary } from '@/lib/queries/providers';

function supportsImageInput(model: ModelSummary | null | undefined): boolean {
  return model?.modalities?.input.includes('image') ?? false;
}

function supportsPdfInput(model: ModelSummary | null | undefined): boolean {
  return model?.modalities?.input.includes('pdf') ?? false;
}

export function supportsAnyAttachment(model: ModelSummary | null | undefined): boolean {
  return supportsImageInput(model) || supportsPdfInput(model);
}
