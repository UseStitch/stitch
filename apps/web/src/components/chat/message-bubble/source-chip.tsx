import { LinkIcon } from 'lucide-react';

type SourceChipProps = {
  url: string;
  title?: string;
};

export function SourceChip({ url, title }: SourceChipProps) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 mr-1 inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
    >
      <LinkIcon className="size-2.5 shrink-0" />
      <span className="max-w-45 truncate">{title ?? url}</span>
    </a>
  );
}
