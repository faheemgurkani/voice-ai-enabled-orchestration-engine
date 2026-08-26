import { useEffect, useState } from 'react';
import { STATUS_META, LANGUAGE_META, SECTION_162_DISCLAIMER } from '@/lib/types';
import type { StatementStatus, LanguageCode } from '@/lib/types';

export function StatusBadge({ status }: { status: StatementStatus }) {
  const meta = STATUS_META[status] || { label: status, color: 'gray' };
  return (
    <span className={`badge-e badge-${meta.color}`}>
      {meta.label}
    </span>
  );
}

export function LanguageChip({ lang }: { lang: LanguageCode }) {
  const meta = LANGUAGE_META[lang];
  let label = meta ? meta.label : lang;
  if (lang === 'ps' && !label.includes('limited')) {
    label += ' (limited)';
  }
  return (
    <span className="badge-e badge-gray">
      {label}
    </span>
  );
}

export function FlagBadge({ type, label }: { type: 'intimidation' | 'inconsistency' | 'privacy' | 'confirmed' | 'delayed', label: string }) {
  const colorMap = {
    intimidation: 'red',
    inconsistency: 'orange',
    privacy: 'slate',
    confirmed: 'teal',
    delayed: 'amber',
  };
  return (
    <span className={`badge-e badge-${colorMap[type]}`}>
      {label}
    </span>
  );
}

export function DisclaimerBadge() {
  return (
    <div className="disclaimer-162">
      {SECTION_162_DISCLAIMER}
    </div>
  );
}

export function ScoreBar({
  score,
  label,
}: {
  score?: number | null;
  label?: string;
}) {
  if (score == null || Number.isNaN(score)) {
    return (
      <div className="score-bar-wrap">
        {label && <span>{label}</span>}
        <div className="score-bar-track">
          <div className="score-bar-fill gray" style={{ width: '0%' }} />
        </div>
        <span style={{ minWidth: '40px', textAlign: 'right' }}>—</span>
      </div>
    );
  }

  let color = 'red';
  if (score >= 0.7) color = 'green';
  else if (score >= 0.4) color = 'amber';

  const percentage = Math.round(score * 100);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(percentage));
    return () => cancelAnimationFrame(id);
  }, [percentage]);

  return (
    <div className="score-bar-wrap">
      {label && <span>{label}</span>}
      <div className="score-bar-track">
        <div className={`score-bar-fill ${color}`} style={{ width: `${width}%` }} />
      </div>
      <span style={{ minWidth: '40px', textAlign: 'right' }}>{percentage}%</span>
    </div>
  );
}

export function UrgentBanner() {
  return (
    <div className="health-banner" style={{ letterSpacing: '0.12em' }}>
      ⚠ URGENT ESCALATION — Intimidation flagged. Immediate action required.
    </div>
  );
}
