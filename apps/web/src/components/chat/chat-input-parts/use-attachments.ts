import * as React from 'react';

import type { Attachment } from './types';

type ElectronFile = File & { path?: string };

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

  if (electronFile.path && electronFile.path.length > 0) {
    const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      path: electronFile.path,
      previewUrl,
      mime: file.type || 'application/octet-stream',
      filename: file.name,
    };
  }

  if (!window.api?.files?.writeTmp) return null;

  const arrayBuffer = await file.arrayBuffer();
  const ext = mimeToExt(file.type);
  const filePath = await window.api.files.writeTmp(arrayBuffer, ext);
  const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    path: filePath,
    previewUrl,
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

type UseAttachmentsOptions = {
  pendingAttachments?: Attachment[];
  onPendingAttachmentsConsumed?: () => void;
};

export function useAttachments(options: UseAttachmentsOptions) {
  const { pendingAttachments, onPendingAttachmentsConsumed } = options;
  const [attachments, setAttachments] = React.useState<Attachment[]>([]);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    if (pendingAttachments && pendingAttachments.length > 0) {
      setAttachments(pendingAttachments);
      onPendingAttachmentsConsumed?.();
    }
  }, [pendingAttachments, onPendingAttachmentsConsumed]);

  const addFiles = React.useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const processed = await Promise.all(fileArray.map(fileToAttachment));
    const valid = processed.filter((attachment): attachment is Attachment => attachment !== null);
    setAttachments((previous) => [...previous, ...valid]);
  }, []);

  const removeAttachment = React.useCallback((id: string) => {
    setAttachments((previous) => {
      const attachment = previous.find((item) => item.id === id);
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return previous.filter((item) => item.id !== id);
    });
  }, []);

  const handlePaste = React.useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(event.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith('image/'));
      if (imageItems.length === 0) return;

      event.preventDefault();
      const files = imageItems
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      await addFiles(files);
    },
    [addFiles],
  );

  const handleDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = React.useCallback((event: React.DragEvent) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = React.useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer.files.length > 0) {
        await addFiles(event.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const handleFileInputChange = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
        await addFiles(event.target.files);
      }
      event.target.value = '';
    },
    [addFiles],
  );

  const consumeForSubmit = React.useCallback(() => {
    const next = attachments;
    setAttachments([]);
    return next;
  }, [attachments]);

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
