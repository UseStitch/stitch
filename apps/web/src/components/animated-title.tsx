import * as React from 'react';

import { cn } from '@/lib/utils';

type AnimatedTitleProps = {
  title: string;
  className?: string;
};

export function AnimatedTitle({ title, className }: AnimatedTitleProps) {
  const [animationKey, setAnimationKey] = React.useState(0);
  const prevTitleRef = React.useRef(title);

  React.useEffect(() => {
    if (title !== prevTitleRef.current) {
      prevTitleRef.current = title;
      setAnimationKey((k) => k + 1);
    }
  }, [title]);

  return (
    <span
      className={cn('animated-title', className)}
      aria-label={title}
    >
      {[...title].map((char, i) => (
        <span
          key={`${animationKey}-${i}`}
          className="animated-title-char inline-block"
          style={{
            animation: 'char-reveal 240ms cubic-bezier(0.23, 1, 0.32, 1) both',
            animationDelay: `${i * 0.014}s`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}
