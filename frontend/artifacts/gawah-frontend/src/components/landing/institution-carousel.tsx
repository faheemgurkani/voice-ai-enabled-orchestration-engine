import { useEffect, useRef, useState } from 'react';
import { LayoutGroup, motion, useReducedMotion } from 'framer-motion';

type InstitutionItem = {
  id: string;
  idx: string;
  title: string;
  description: string;
};

const INTERVAL = 4500;
const layoutEase = [0.4, 0, 0.2, 1] as const;

/** Auto-cycling buyer row — active card expands horizontally, inactive cards
    compress with clipped visuals; hover pauses, click jumps to a card. */
export function InstitutionCarousel({ items }: { items: InstitutionItem[] }) {
  const [active, setActive] = useState(0);
  const [cycle, setCycle] = useState(0);
  const reduce = useReducedMotion();
  const pausedRef = useRef(false);

  useEffect(() => {
    if (reduce || items.length <= 1) return;
    const id = window.setInterval(() => {
      if (pausedRef.current) return;
      setActive((i) => (i + 1) % items.length);
      setCycle((c) => c + 1);
    }, INTERVAL);
    return () => window.clearInterval(id);
  }, [reduce, items.length]);

  const select = (i: number) => {
    setActive(i);
    setCycle((c) => c + 1);
  };

  return (
    <LayoutGroup id="inst-carousel">
      <div
        className="inst-row"
        onMouseEnter={() => {
          pausedRef.current = true;
        }}
        onMouseLeave={() => {
          pausedRef.current = false;
        }}
      >
        {items.map((item, i) => {
          const isActive = i === active;
          return (
            <motion.button
              key={item.id}
              type="button"
              layout={!reduce}
              transition={{ layout: { duration: 0.52, ease: layoutEase } }}
              className={`inst-card ${isActive ? 'is-active' : ''}`}
              style={{ flex: isActive ? 3.4 : 1 }}
              onClick={() => select(i)}
              aria-pressed={isActive}
            >
              <div className="inst-visual">
                <span className="inst-idx">{item.idx}</span>
              </div>
              <div className="inst-progress-track">
                {isActive && !reduce && (
                  <span
                    key={`${item.id}-${cycle}`}
                    className="inst-progress-fill"
                    style={{ animationDuration: `${INTERVAL}ms` }}
                  />
                )}
                {isActive && reduce && <span className="inst-progress-fill" style={{ width: '100%' }} />}
              </div>
              <div className="inst-caption">
                <h3>{item.title}</h3>
                <div className="inst-caption-body">
                  <p className="inst-caption-desc">{item.description}</p>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
