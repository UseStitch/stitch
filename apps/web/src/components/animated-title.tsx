import * as React from 'react';

type AnimatedTitleProps = {
  title: string;
  className?: string;
};

export function AnimatedTitle({ title, className }: AnimatedTitleProps) {
  const [animatingTitle, setAnimatingTitle] = React.useState(title);
  const [animationKey, setAnimationKey] = React.useState(0);
  const prevTitleRef = React.useRef(title);

  React.useEffect(() => {
    if (title !== prevTitleRef.current) {
      prevTitleRef.current = title;
      setAnimatingTitle(title);
      setAnimationKey((k) => k + 1);
    }
  }, [title]);

  return (
    <span className={className} aria-label={animatingTitle}>
      {[...animatingTitle].map((char, i) => (
        <span
          key={`${animationKey}-${i}`}
          className="inline-block"
          style={{
            animation: `char-reveal 0.4s cubic-bezier(0.22, 1, 0.36, 1) both`,
            animationDelay: `${i * 0.025}s`,
          }}
        >
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </span>
  );
}
