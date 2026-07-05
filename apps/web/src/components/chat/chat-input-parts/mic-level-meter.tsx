import { cn } from '@/lib/utils';

type MicLevelMeterProps = {
  /** Normalized audio level in the 0–1 range. */
  level: number;
  className?: string;
};

// Fixed per-bar weights so the meter reads as a centered, organic spread
// rather than a flat block. Multiplied by the live level.
const BAR_WEIGHTS = [0.45, 0.75, 1, 0.75, 0.45];

/**
 * Live microphone level meter. Bars scale with the incoming audio level.
 * Falls back to a static "Listening" label when reduced motion is preferred.
 */
export function MicLevelMeter({ level, className }: MicLevelMeterProps) {
  return (
    <div className={cn('flex items-center', className)} aria-hidden="true">
      <div className="flex h-4 items-center gap-0.5 motion-reduce:hidden">
        {BAR_WEIGHTS.map((weight, i) => {
          const height = Math.max(3, Math.min(16, level * weight * 16 + 3));
          return (
            <span
              key={i}
              className="w-0.5 rounded-full bg-destructive transition-[height] duration-75 ease-out"
              style={{ height: `${height}px` }}
            />
          );
        })}
      </div>
      <span className="hidden text-xs font-medium text-destructive motion-reduce:inline">Listening</span>
    </div>
  );
}
