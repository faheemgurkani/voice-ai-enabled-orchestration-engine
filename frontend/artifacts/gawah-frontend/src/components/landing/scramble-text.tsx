import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ01#$%▣■□▢';

type ScrambleTextProps = {
  text: string;
  className?: string;
  as?: 'h1' | 'span' | 'div';
  duration?: number;
};

/**
 * One-time scramble-to-resolve reveal, in the spirit of Motion Primitives'
 * text-effect components — plain intervals + framer's useInView, no extra deps.
 */
export function ScrambleText({ text, className, as = 'span', duration = 700 }: ScrambleTextProps) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? text : ' '.repeat(text.length));

  useEffect(() => {
    if (!inView || reduce) {
      if (reduce) setDisplay(text);
      return;
    }
    const totalFrames = Math.max(12, Math.round(duration / 35));
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const revealCount = Math.floor((frame / totalFrames) * text.length);
      setDisplay(
        text
          .split('')
          .map((ch, i) => {
            if (ch === ' ') return ' ';
            if (i < revealCount) return ch;
            return CHARSET[Math.floor(Math.random() * CHARSET.length)];
          })
          .join(''),
      );
      if (frame >= totalFrames) {
        setDisplay(text);
        window.clearInterval(id);
      }
    }, 35);
    return () => window.clearInterval(id);
  }, [inView, reduce, text, duration]);

  const Tag = as;
  return (
    <Tag ref={ref as never} className={className} aria-label={text}>
      {display}
    </Tag>
  );
}
