import { Text } from '@/components/primitives/text.js';

type ErrorPanelProps = { title: string; message: string; suggestion?: string; className?: string };

export function ErrorPanel({ title, message, suggestion, className }: ErrorPanelProps) {
  return (
    <div
      className={[
        'w-full rounded-lg border border-destructive-subtle bg-destructive-subtle px-space-xl py-space-m text-sm text-destructive',
        className,
      ]
        .filter(Boolean)
        .join(' ')}>
      <Text as="p" variant="body-strong" tone="destructive">
        {title}
      </Text>
      <Text as="p" variant="body" tone="destructive">
        {message}
      </Text>
      {suggestion ? (
        <div className="mt-space-xs">
          <Text as="p" variant="caption" tone="destructive">
            {suggestion}
          </Text>
        </div>
      ) : null}
    </div>
  );
}
