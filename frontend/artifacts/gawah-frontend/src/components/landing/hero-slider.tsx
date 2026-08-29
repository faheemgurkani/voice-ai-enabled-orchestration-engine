import { type ReactNode, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

type Slide = {
  id: string;
  label: string;
  content: ReactNode;
};

type HeroSliderProps = {
  slides: Slide[];
  interval?: number;
  /** Pins the card itself (not the dots row below it) to this height, so it
      lines up with a sibling's border instead of the dots eating into it. */
  cardHeight?: number;
};

/** Auto-rotating crossfade between the hero's meta card and a product preview. */
export function HeroSlider({ slides, interval = 4200, cardHeight }: HeroSliderProps) {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce || slides.length <= 1) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % slides.length);
    }, interval);
    return () => window.clearInterval(id);
  }, [reduce, slides.length, interval]);

  const current = slides[active];

  return (
    <div className="hero-slider">
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          style={cardHeight ? { height: cardHeight } : undefined}
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -10 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {current.content}
        </motion.div>
      </AnimatePresence>

      {slides.length > 1 && (
        <div className="hero-slider-dots" role="tablist" aria-label="Hero preview slides">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={s.label}
              className={`hero-slider-dot ${i === active ? 'active' : ''}`}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
