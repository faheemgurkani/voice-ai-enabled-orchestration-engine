import { useEffect, useState } from 'react';
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

const layoutEase = [0.22, 1, 0.36, 1] as const;

/** Auto-cycling accordion (left) + crossfading screenshot (right) —
    left column height matches the preview; the active pillar always
    expands to fill the remaining space so the block never looks empty. */
export function IntelligenceExplorer({
  items,
  interval = 5200,
}: {
  items: IntelligenceItem[];
  interval?: number;
}) {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const current = items[active];
  const { sourceRef: visualRef, height: boardHeight } = useMatchHeight<HTMLDivElement>();

  useEffect(() => {
    if (reduce || items.length <= 1) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % items.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [reduce, items.length, interval]);

  return (
    <div className="intel-board">
      <div
        className="intel-list"
        style={boardHeight ? { height: boardHeight } : undefined}
      >
        {items.map((item, i) => {
          const isActive = i === active;
          return (
            <motion.button
              key={item.id}
              type="button"
              layout={!reduce}
              transition={{ layout: { duration: 0.36, ease: layoutEase } }}
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
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={reduce ? undefined : { opacity: 0 }}
                    transition={{ duration: 0.28, ease: layoutEase }}
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
            </motion.button>
          );
        })}
      </div>

      <div className="intel-visual" ref={visualRef}>
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: layoutEase }}
          >
            <HeroScreenshotSlide src={current.shot.src} label={current.shot.label} alt={current.shot.alt} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
