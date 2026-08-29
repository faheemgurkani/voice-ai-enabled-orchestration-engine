import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { ScrambleText } from '@/components/landing/scramble-text';

/** Caller ID masking to a reference code — the actual anonymity mechanism, visualized. */
export function RedactionWidget() {
  return (
    <div className="pw-redact">
      <div>
        <div className="pw-redact-label">Caller ID</div>
        <div className="pw-redact-value text-e-muted">+92 3●● ●●● ●21</div>
      </div>
      <div className="pw-redact-arrow" aria-hidden>
        ↓
      </div>
      <div>
        <div className="pw-redact-label">Dashboard shows</div>
        <div className="pw-redact-value text-e-accent">
          <ScrambleText text="NBRA7K" duration={900} />
        </div>
      </div>
    </div>
  );
}

/** Statement record with an animate-in progress fill — the immutable-timestamp answer, visualized. */
export function RecordWidget() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });
  const reduce = useReducedMotion();

  return (
    <div className="pw-record" ref={ref}>
      <span className="pw-record-icon" aria-hidden>
        REC
      </span>
      <div className="pw-record-body">
        <div className="pw-record-name">statement_NBRA7K.rec</div>
        <div className="pw-record-bar">
          <div
            className="pw-record-bar-fill"
            style={{ width: inView || reduce ? '100%' : '0%' }}
          />
        </div>
        <div className="pw-record-meta">Timestamped · Immutable</div>
      </div>
    </div>
  );
}

/** A split bar contrasting one figure against its complement — reused for any stat pair. */
export function SplitStat({
  value,
  labelA,
  labelB,
  suffix = '%',
}: {
  value: number;
  labelA: string;
  labelB: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!inView && !reduce) return;
    const id = requestAnimationFrame(() => setWidth(value));
    return () => cancelAnimationFrame(id);
  }, [inView, reduce, value]);

  return (
    <div ref={ref}>
      <div className="pw-split-bar">
        <div className="pw-split-seg-a" style={{ width: `${width}%` }} />
        <div className="pw-split-seg-b" />
      </div>
      <div className="pw-split-legend">
        <div>
          <div className="val text-e-accent">
            {value}
            {suffix}
          </div>
          <div className="pw-redact-label">{labelA}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="val text-e-muted">
            {100 - value}
            {suffix}
          </div>
          <div className="pw-redact-label">{labelB}</div>
        </div>
      </div>
    </div>
  );
}

/** Compact normalized mini bars — GBV case-type breakdown, for use inside the one big visual card. */
export function GbvMiniBars() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!inView && !reduce) return;
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, [inView, reduce]);

  const rows = [
    { label: 'Kidnapping', value: 24439 },
    { label: 'Rape', value: 5339 },
    { label: 'Domestic violence', value: 2238 },
    { label: 'Honour killings', value: 547 },
  ];
  const max = rows[0].value;
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div ref={ref} className="pw-gbv">
      {rows.map((r, i) => (
        <button
          key={r.label}
          type="button"
          className={`pw-gbv-row${hover === i ? ' is-hover' : ''}`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
        >
          <div className="pw-gbv-label">{r.label}</div>
          <div className="pw-gbv-track">
            <div
              className="pw-gbv-fill"
              style={{ width: on ? `${(r.value / max) * 100}%` : '0%' }}
            />
          </div>
          <div className="pw-gbv-value">{r.value.toLocaleString()}</div>
        </button>
      ))}
    </div>
  );
}

/** Same GBV case-type data as the bars, drawn as a connected line — an
    honest second view of one real dataset, not a fabricated time trend. */
export function GbvTrendLine() {
  const ref = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px -10% 0px' });
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!inView && !reduce) return;
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, [inView, reduce]);

  const points = [
    { label: 'Kidnapping', value: 24439 },
    { label: 'Rape', value: 5339 },
    { label: 'Domestic v.', value: 2238 },
    { label: 'Honour k.', value: 547 },
  ];
  const w = 300;
  const h = 140;
  const padTop = 26;
  const plotH = h - padTop;
  const step = w / (points.length - 1);
  // Values span two orders of magnitude — a linear y-scale crowds the
  // bottom three points together and their labels collide. Position points
  // on a log scale (real values still shown verbatim in the labels).
  const logs = points.map((p) => Math.log(p.value));
  const logMax = Math.max(...logs);
  const logMin = Math.min(...logs);
  const logRange = logMax - logMin;
  const coords = points.map((p, i) => ({
    x: i * step,
    y: padTop + plotH - ((Math.log(p.value) - logMin) / logRange) * plotH,
  }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const pathLength = 500;
  const dashProps = {
    strokeDasharray: pathLength,
    strokeDashoffset: reduce || on ? 0 : pathLength,
  };
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="pw-trend">
      <svg
        ref={ref}
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="pw-trend-svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="pw-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--e-accent)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--e-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={areaPath}
          fill="url(#pw-trend-fill)"
          stroke="none"
          style={{ opacity: reduce || on ? 1 : 0, transition: 'opacity 700ms 300ms var(--e-ease)' }}
        />
        <path
          d={linePath}
          fill="none"
          stroke="var(--e-accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={pathLength}
          style={{ ...dashProps, transition: 'stroke-dashoffset 900ms var(--e-ease)' }}
        />
        {coords.map((c, i) => (
          <g
            key={i}
            className="pw-trend-pt"
            tabIndex={0}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            {/* generous invisible hit area so the marker is easy to hover/focus */}
            <circle cx={c.x} cy={c.y} r="14" fill="transparent" />
            <circle
              cx={c.x}
              cy={c.y}
              r={hover === i ? 6.5 : 4.5}
              fill={hover === i ? 'var(--e-accent)' : 'var(--e-bg)'}
              stroke="var(--e-accent)"
              strokeWidth="2"
              style={{ transition: 'r 150ms var(--e-ease), fill 150ms var(--e-ease)' }}
            />
            <text
              x={c.x}
              y={c.y - 12}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              fontSize={hover === i ? 12 : 11}
              fontFamily="'JetBrains Mono', monospace"
              fontWeight={700}
              fill={hover === i ? 'var(--e-accent)' : 'var(--e-fg)'}
            >
              {points[i].value.toLocaleString()}
            </text>
          </g>
        ))}
      </svg>
      <div className="pw-trend-labels">
        {points.map((p, i) => (
          <span key={p.label} className={hover === i ? 'is-hover' : undefined}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  );
}
