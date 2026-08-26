import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'problem', label: 'Problem' },
  { id: 'anonymous', label: 'Anonymous' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'legal', label: 'Legal' },
  { id: 'model', label: 'Model' },
  { id: 'future', label: 'Future' },
  { id: 'close', label: 'Close' },
] as const;

export function SectionRail() {
  const [active, setActive] = useState<string>('problem');
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    const nodes = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      Boolean,
    ) as HTMLElement[];
    if (!nodes.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) setActive(visible.target.id);
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0.15, 0.4, 0.7] },
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Only show the rail once the page has scrolled fully past the marquee
    // band (the black ticker strip right after the hero) — not while it's
    // still on screen or before it's been reached.
    const band = document.getElementById('land-band');
    if (!band) return;

    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(entry.boundingClientRect.bottom <= 0),
      { threshold: 0 },
    );
    observer.observe(band);
    return () => observer.disconnect();
  }, []);

  if (!pastHero) return null;

  return (
    <nav className="land-rail" aria-label="Landing sections">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`land-rail-item ${active === s.id ? 'active' : ''}`}
          data-label={s.label}
        >
          <span className="land-rail-dot" />
        </a>
      ))}
    </nav>
  );
}
