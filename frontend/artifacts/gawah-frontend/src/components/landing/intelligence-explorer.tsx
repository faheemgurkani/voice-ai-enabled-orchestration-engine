import { useEffect, useState } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';
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

const layoutEase = [0.4, 0, 0.2, 1] as const;

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
      <LayoutGroup id="intel-accordion">
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
                transition={{ layout: { duration: 0.48, ease: layoutEase } }}
                className={`intel-item ${isActive ? 'is-active' : ''}`}
                onClick={() => setActive(i)}
                aria-expanded={isActive}
              >
                <div className="intel-item-h">
                  <span className={`dot ${item.dot}`} />
                  {item.title}
                </div>
                {isActive && (
                  <motion.div
                    key={`body-${item.id}`}
                    initial={reduce ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.32, ease: layoutEase, delay: 0.1 }}
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
              </motion.button>
            );
          })}
        </div>
      </LayoutGroup>

      <div className="intel-visual" ref={visualRef}>
        <div className="intel-visual-stack">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              className={`intel-visual-layer${i === active ? ' is-active' : ''}`}
              animate={{ opacity: i === active ? 1 : 0 }}
              transition={{ duration: 0.48, ease: layoutEase }}
              style={{ zIndex: i === active ? 1 : 0 }}
              aria-hidden={i !== active}
            >
              <HeroScreenshotSlide src={item.shot.src} label={item.shot.label} alt={item.shot.alt} />
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
