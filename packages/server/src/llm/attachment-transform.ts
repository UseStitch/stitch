import * as Models from '@/provider/models.js';
import type { ModelMessage, FilePart, ImagePart, TextPart } from 'ai';

type Modality = 'image' | 'video' | 'audio' | 'pdf';

function mimeToModality(mime: string): Modality | null {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  return null;
}

type UserPart = TextPart | ImagePart | FilePart;

function getPartMime(part: UserPart): string | null {
  if (part.type === 'image') {
    return part.mediaType ?? 'image/unknown';
  }
  if (part.type === 'file') {
    return part.mediaType;
  }
  return null;
}

function getPartFilename(part: UserPart): string | null {
  if (part.type === 'file') {
    return part.filename ?? null;
  }
  return null;
}

function makeUnsupportedText(modality: Modality, filename: string | null): TextPart {
  const label = filename ? `"${filename}"` : modality;
  return {
    type: 'text',
    text: `[Attachment ${label} was removed because this model does not support ${modality} input.]`,
  };
}

export async function transformAttachmentsForModel(
  messages: ModelMessage[],
  providerId: string,
  modelId: string,
): Promise<ModelMessage[]> {
  const providers = await Models.get();
  const model = providers[providerId]?.models[modelId];
  const supportedInputModalities: string[] = model?.modalities?.input ?? [];

  return messages.map((msg): ModelMessage => {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) return msg;

    const transformed = (msg.content as UserPart[]).map((part): UserPart => {
      if (part.type !== 'image' && part.type !== 'file') return part;

      const mime = getPartMime(part);
      if (!mime) return part;

      const modality = mimeToModality(mime);
      if (!modality) return part;

      if (supportedInputModalities.includes(modality)) return part;

      return makeUnsupportedText(modality, getPartFilename(part));
    });

    return { ...msg, content: transformed };
  });
}
