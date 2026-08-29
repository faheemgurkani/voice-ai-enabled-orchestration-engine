import { type CSSProperties, type ReactNode, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';

type RevealProps = {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  y?: number;
};

export function Reveal({ children, className, style, delay = 0, y = 28 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -8% 0px' });
  const reduce = useReducedMotion();

  return (
    <motion.div
      ref={ref}
      className={className}
      style={style}
      initial={reduce ? false : { opacity: 0, y }}
      animate={inView || reduce ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
