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

/** Conviction-rate split bar, same visual language as the app's own corroboration ScoreBar. */
export function ConvictionBar({ value = 8.66 }: { value?: number }) {
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
          <div className="val text-e-accent">{value.toFixed(2)}%</div>
          <div className="pw-redact-label">Convicted</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="val text-e-muted">{(100 - value).toFixed(2)}%</div>
          <div className="pw-redact-label">Unresolved</div>
        </div>
      </div>
    </div>
  );
}
