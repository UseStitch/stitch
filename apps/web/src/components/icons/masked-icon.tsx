import { cn } from '@/lib/utils';

type MaskedIconProps = {
  src: string;
  label: string;
  className?: string;
};

export function MaskedIcon({ src, label, className }: MaskedIconProps) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn('bg-foreground', className)}
      style={{
        WebkitMask: `url(${src}) no-repeat center / contain`,
        mask: `url(${src}) no-repeat center / contain`,
      }}
    />
  );
}
