import { motion, useReducedMotion } from 'framer-motion';

type BorderTrailProps = {
  color?: string;
  size?: number;
  duration?: number;
};

/**
 * A single light tracing the hard border of a card, offset-path based —
 * same idea as Motion Primitives' border-trail, skinned to a square trail
 * (no radius) to match the brutalist card system.
 */
export function BorderTrail({ color = 'var(--e-accent)', size = 8, duration = 3.2 }: BorderTrailProps) {
  const reduce = useReducedMotion();
  if (reduce) return null;

  return (
    <div className="border-trail-layer" aria-hidden>
      <motion.div
        className="border-trail-dot"
        style={{
          width: size,
          height: size,
          background: color,
          offsetPath: 'inset(0px round 0px)',
        }}
        animate={{ offsetDistance: ['0%', '100%'] }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
}
