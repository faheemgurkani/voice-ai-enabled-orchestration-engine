import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Shows 3 cards at a time; drag/scroll or the arrow buttons reveal the rest. */
export function CardCarousel({ children }: { children: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const updateEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  useEffect(() => {
    updateEdges();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, []);

  const scrollByCard = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const step = card ? card.offsetWidth + 14 : el.clientWidth / 3;
    el.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <div className="carousel">
      <div className="carousel-track" ref={trackRef}>
        {children}
      </div>
      <div className="carousel-nav">
        <button
          type="button"
          className="carousel-arrow"
          aria-label="Previous card"
          onClick={() => scrollByCard(-1)}
          disabled={atStart}
        >
          ←
        </button>
        <button
          type="button"
          className="carousel-arrow"
          aria-label="Next card"
          onClick={() => scrollByCard(1)}
          disabled={atEnd}
        >
          →
        </button>
      </div>
    </div>
  );
}
