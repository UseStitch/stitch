type ErrorPanelProps = {
  title: string;
  message: string;
  suggestion?: string;
  className?: string;
};

export function ErrorPanel({ title, message, suggestion, className }: ErrorPanelProps) {
  return (
    <div
      className={[
        'w-full rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <p className="font-medium">{title}</p>
      <p>{message}</p>
      {suggestion ? <p className="mt-1 text-xs text-destructive/80">{suggestion}</p> : null}
    </div>
  );
}
