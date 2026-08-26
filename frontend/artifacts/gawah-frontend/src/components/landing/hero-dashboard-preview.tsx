import { StatusBadge, LanguageChip, ScoreBar } from '@/components/badges';

const ROWS = [
  { ref: 'NBRA7K', status: 'urgent_escalation' as const, lang: 'ur' as const, score: 0.82 },
  { ref: 'SHPK2M', status: 'reviewed' as const, lang: 'pa' as const, score: 0.91 },
  { ref: 'NBRC9Q', status: 'pending_review' as const, lang: 'ur' as const, score: 0.68 },
];

/** A real mini-render of the dashboard's own table + badge components — not a fabricated screenshot. */
export function HeroDashboardPreview() {
  return (
    <div className="bento">
      <div className="bento-h">
        <span className="dot dot-o" />
        PREVIEW · DASHBOARD
        <span className="bento-name">LIVE UI</span>
      </div>
      <div className="bento-body" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="brutal" style={{ border: 'none' }}>
          <thead>
            <tr>
              <th>REF</th>
              <th>STATUS</th>
              <th>LANG</th>
              <th>SCORE</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.ref}>
                <td className="first">{r.ref}</td>
                <td>
                  <StatusBadge status={r.status} />
                </td>
                <td>
                  <LanguageChip lang={r.lang} />
                </td>
                <td style={{ minWidth: 120 }}>
                  <ScoreBar score={r.score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
