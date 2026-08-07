import * as React from 'react';

import type { Attachment } from './types';

type ElectronFile = File & { path?: string };

const previewUrls = new Map<string, string>();

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
  };
  return map[mime] ?? 'bin';
}

async function fileToAttachment(file: File): Promise<Attachment | null> {
  const electronFile = file as ElectronFile;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (electronFile.path && electronFile.path.length > 0) {
    if (file.type.startsWith('image/')) previewUrls.set(id, URL.createObjectURL(file));
    return {
      id,
      path: electronFile.path,
      previewUrl: previewUrls.get(id) ?? null,
      mime: file.type || 'application/octet-stream',
      filename: file.name,
    };
  }

  const arrayBuffer = await file.arrayBuffer();
  const ext = mimeToExt(file.type);
  const filePath = await window.api.files.writeTmp(arrayBuffer, ext);
  if (file.type.startsWith('image/')) previewUrls.set(id, URL.createObjectURL(file));

  return {
    id,
    path: filePath,
    previewUrl: previewUrls.get(id) ?? null,
    mime: file.type,
    filename: file.name || `paste.${ext}`,
  };
}

const TEXT_FILE_ACCEPT = [
  '.txt',
  '.md',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.html',
  '.css',
  '.scss',
  '.sh',
  '.toml',
  '.xml',
].join(',');

export const ATTACHMENT_ACCEPT = `image/*,.pdf,${TEXT_FILE_ACCEPT}`;

type UseAttachmentsOptions = { pendingAttachments?: Attachment[]; onPendingAttachmentsConsumed?: () => void };

export function useAttachments(options: UseAttachmentsOptions) {
  const { pendingAttachments, onPendingAttachmentsConsumed } = options;
  const [attachments, setAttachments] = React.useState<Attachment[]>(pendingAttachments ?? []);
  const [isDragging, setIsDragging] = React.useState(false);
  const [appliedPending, setAppliedPending] = React.useState(pendingAttachments);

  if (appliedPending !== pendingAttachments) {
    setAppliedPending(pendingAttachments);
    if (pendingAttachments && pendingAttachments.length > 0) {
      setAttachments(pendingAttachments);
    }
  }

  React.useEffect(() => {
    if (pendingAttachments && pendingAttachments.length > 0) {
      onPendingAttachmentsConsumed?.();
    }
  }, [pendingAttachments, onPendingAttachmentsConsumed]);

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const processed = await Promise.all(fileArray.map(fileToAttachment));
    const valid = processed.filter((attachment): attachment is Attachment => attachment !== null);
    setAttachments((previous) => [...previous, ...valid]);
  };

  const removeAttachment = (id: string) => {
    const url = previewUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrls.delete(id);
    }
    setAttachments((previous) => previous.filter((item) => item.id !== id));
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData.items);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    event.preventDefault();
    const files = imageItems.map((item) => item.getAsFile()).filter((file): file is File => file !== null);
    await addFiles(files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      await addFiles(event.dataTransfer.files);
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      await addFiles(event.target.files);
    }
    event.target.value = '';
  };

  const consumeForSubmit = () => {
    const next = attachments;
    setAttachments([]);
    return next;
  };

  return {
    attachments,
    isDragging,
    setAttachments,
    removeAttachment,
    handlePaste,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleFileInputChange,
    consumeForSubmit,
  };
}
