import { Text } from '@/components/primitives/text.js';
import { cn } from '@/lib/utils';

type MicLevelMeterProps = {
  /** Normalized audio level in the 0–1 range. */
  level: number;
  className?: string;
};

// Fixed per-bar weights so the meter reads as a centered, organic spread
// rather than a flat block. Multiplied by the live level.
const BARS = [
  { id: 'bar-1', weight: 0.45 },
  { id: 'bar-2', weight: 0.75 },
  { id: 'bar-3', weight: 1 },
  { id: 'bar-4', weight: 0.75 },
  { id: 'bar-5', weight: 0.45 },
];

/**
 * Live microphone level meter. Bars scale with the incoming audio level.
 * Falls back to a static "Listening" label when reduced motion is preferred.
 */
export function MicLevelMeter({ level, className }: MicLevelMeterProps) {
  return (
    <span className={cn('flex items-center', className)} aria-hidden="true">
      <span className="flex h-4 items-center gap-space-2xs motion-reduce:hidden">
        {BARS.map(({ id, weight }) => {
          const height = Math.max(3, Math.min(16, level * weight * 16 + 3));
          return (
            <span
              key={id}
              className="duration-fast w-0.5 rounded-full bg-destructive transition-[height] ease-standard"
              style={{ height: `${height}px` }}
            />
          );
        })}
      </span>
      <span className="hidden motion-reduce:inline">
        <Text as="span" variant="label" tone="destructive">
          Listening
        </Text>
      </span>
    </span>
  );
}
