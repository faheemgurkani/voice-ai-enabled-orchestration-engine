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

  return (
    <div ref={ref} className="pw-gbv">
      {rows.map((r) => (
        <div key={r.label} className="pw-gbv-row">
          <div className="pw-gbv-label">{r.label}</div>
          <div className="pw-gbv-track">
            <div
              className="pw-gbv-fill"
              style={{ width: on ? `${(r.value / max) * 100}%` : '0%' }}
            />
          </div>
          <div className="pw-gbv-value">{r.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
