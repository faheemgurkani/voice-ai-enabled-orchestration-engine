import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { HeroScreenshotSlide } from '@/components/landing/hero-screenshot-slide';
import { useMatchHeight } from '@/hooks/use-match-height';

export type IntelligenceItem = {
  id: string;
  dot: 'dot-o' | 'dot-k' | 'dot-r';
  title: string;
  description: string;
  bullets: string[];
  shot: { src: string; label: string; alt: string };
};

/** Click-driven accordion (left) + crossfading screenshot (right) —
    only one pillar expanded at a time, its screenshot swaps to match. */
export function IntelligenceExplorer({ items }: { items: IntelligenceItem[] }) {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const current = items[active];
  const { sourceRef: listRef, height: listHeight } = useMatchHeight<HTMLDivElement>();

  return (
    <div className="intel-board">
      <div className="intel-list" ref={listRef}>
        {items.map((item, i) => {
          const isActive = i === active;
          return (
            <button
              key={item.id}
              type="button"
              className={`intel-item ${isActive ? 'is-active' : ''}`}
              onClick={() => setActive(i)}
              aria-expanded={isActive}
            >
              <div className="intel-item-h">
                <span className={`dot ${item.dot}`} />
                {item.title}
              </div>
              <AnimatePresence initial={false}>
                {isActive && (
                  <motion.div
                    key="body"
                    initial={reduce ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={reduce ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                    className="intel-item-body"
                  >
                    <p>{item.description}</p>
                    <ul className="e-bullets">
                      {item.bullets.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <div className="intel-visual" style={listHeight ? { height: listHeight } : undefined}>
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <HeroScreenshotSlide src={current.shot.src} label={current.shot.label} alt={current.shot.alt} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
