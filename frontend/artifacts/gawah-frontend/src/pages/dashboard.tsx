import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { fetchStatements, fetchKpis } from '@/lib/api';
import { PageShell } from '@/components/layout/page-shell';
import { StatusBadge, LanguageChip, FlagBadge, ScoreBar } from '@/components/badges';
import { ESelect } from '@/components/e-select';
import { CountUp } from '@/components/count-up';

const STATUS_OPTIONS = [
  { value: 'all', label: 'ALL' },
  { value: 'pending_review', label: 'PENDING REVIEW' },
  { value: 'urgent_escalation', label: 'URGENT ESCALATION' },
  { value: 'reviewed', label: 'REVIEWED' },
  { value: 'incomplete', label: 'INCOMPLETE' },
] as const;

export default function DashboardPage() {
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState('all');
  const [flagsFilter, setFlagsFilter] = useState<string[]>([]);
  const [page, setPage] = useState(1);

  const flagsParam = flagsFilter.length > 0 ? flagsFilter.join(',') : undefined;

  const { data: kpis, isLoading: loadingKpis } = useQuery({
    queryKey: ['kpis'],
    queryFn: fetchKpis,
    refetchInterval: 4000,
  });

  const { data: list, isLoading: loadingStmts, error } = useQuery({
    queryKey: ['statements', { status: statusFilter, flags: flagsParam, page }],
    queryFn: () =>
      fetchStatements({
        status: statusFilter === 'all' ? undefined : statusFilter,
        flags: flagsParam,
        page,
      }),
    refetchInterval: 4000,
  });

  const toggleFlag = (flag: string) => {
    setFlagsFilter((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
    setPage(1);
  };

  const clearFilters = () => {
    setStatusFilter('all');
    setFlagsFilter([]);
    setPage(1);
  };

  const totalPages = list
    ? Math.max(1, Math.ceil(list.total / Math.max(list.page_size, 1)))
    : 1;

  return (
    <PageShell>
      <div className="marquee">
        <div className="marquee-track">
          DASHBOARD <span className="marquee-star">▣</span> PRE-LITIGATION INTELLIGENCE{' '}
          <span className="marquee-star">▣</span> PAKISTAN <span className="marquee-star">▣</span>
          DASHBOARD <span className="marquee-star">▣</span> PRE-LITIGATION INTELLIGENCE{' '}
          <span className="marquee-star">▣</span> PAKISTAN <span className="marquee-star">▣</span>
        </div>
      </div>

      <div className="page-content page-stack">
        <div className="page-header">
          <div className="page-header-row">
            <div>
              <div className="section-eyebrow">// REVIEW QUEUE · STATEMENTS</div>
              <h1 className="section-title">
                CASE.<span className="accent">DASHBOARD</span>
              </h1>
              <p className="section-sub">
                Review voice-captured §161 statements, flag risk, and escalate protection needs.
              </p>
            </div>
            <Link href="/demo" className="cta-btn">
              <span className="cta-sq">●</span>
              <span className="cta-lbl">New Demo</span>
            </Link>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="hud">
            <div className="hud-k">Total Statements</div>
            <div className="hud-v vt">
              {loadingKpis ? '-' : <CountUp value={kpis?.total_statements ?? 0} duration={0.8} />}
            </div>
          </div>
          <div className="hud">
            <div className="hud-k">Urgent</div>
            <div className="hud-v vt accent">
              {loadingKpis ? '-' : <CountUp value={kpis?.urgent_count ?? 0} duration={0.8} />}
            </div>
          </div>
          <div className="hud">
            <div className="hud-k">Clusters</div>
            <div className="hud-v vt">
              {loadingKpis ? '-' : <CountUp value={kpis?.cluster_count ?? 0} duration={0.8} />}
            </div>
          </div>
          <div className="hud">
            <div className="hud-k">Avg Corroboration</div>
            <div className="hud-v vt">
              {loadingKpis ? (
                '-'
              ) : kpis?.avg_corroboration ? (
                <CountUp value={Math.round(kpis.avg_corroboration * 100)} suffix="%" duration={0.8} />
              ) : (
                'N/A'
              )}
            </div>
          </div>
        </div>
        {/* <DisclaimerBadge /> */}

        <div className="bento">
          <div className="bento-h">
            <span className="dot dot-k" />
            FILTERS
            <span className="bento-name">
              {list ? `${list.total} RESULT${list.total === 1 ? '' : 'S'}` : '—'}
            </span>
          </div>
          <div className="bento-body filter-bar">
            <div className="filter-group" style={{ minWidth: 220 }}>
              <label className="e-label" htmlFor="status-filter">
                Status
              </label>
              <ESelect
                id="status-filter"
                value={statusFilter}
                options={STATUS_OPTIONS}
                onChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                }}
              />
            </div>

            <div className="filter-group">
              <span className="e-label">Flags</span>
              <div className="filter-chips">
                <button
                  type="button"
                  className={`filter-chip ${flagsFilter.includes('intimidation') ? 'active' : ''}`}
                  onClick={() => toggleFlag('intimidation')}
                >
                  <span className="mark" />
                  Intimidation
                </button>
                <button
                  type="button"
                  className={`filter-chip ${flagsFilter.includes('inconsistency') ? 'active' : ''}`}
                  onClick={() => toggleFlag('inconsistency')}
                >
                  <span className="mark" />
                  Inconsistency
                </button>
              </div>
            </div>

            <div style={{ marginLeft: 'auto', paddingBottom: 4 }}>
              <button type="button" className="link-clear" onClick={clearFilters}>
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <div>
          {loadingStmts ? (
            <div className="state-panel">
              <div className="spinner" />
              <div className="pager-meta">Loading statements</div>
            </div>
          ) : error ? (
            <div className="insight" style={{ borderColor: 'var(--e-warn)' }}>
              <span className="insight-lbl">ERROR</span>
              Error loading statements.{' '}
              <button type="button" className="link-clear" onClick={() => setPage(1)}>
                Retry
              </button>
            </div>
          ) : list?.items.length === 0 ? (
            <div className="insight">
              <span className="insight-lbl">EMPTY</span>
              No statements found. Run the voice demo to capture the first statement.
              <div style={{ marginTop: 20 }}>
                <Link href="/demo" className="cta-btn">
                  <span className="cta-sq">●</span>
                  <span className="cta-lbl">Start Demo</span>
                </Link>
              </div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="brutal">
                <thead>
                  <tr>
                    <th>REF CODE</th>
                    <th>LOCATION</th>
                    <th>TIME</th>
                    <th>STATUS</th>
                    <th>LANGUAGE</th>
                    <th>FLAGS</th>
                    <th>SCORE</th>
                  </tr>
                </thead>
                <tbody>
                  {list?.items.map((stmt) => {
                    const urgent =
                      stmt.status === 'urgent_escalation' || stmt.intimidation_flag;
                    return (
                      <tr
                        key={stmt.ref_code}
                        className={`row-link${urgent ? ' row-urgent' : ''}`}
                        tabIndex={0}
                        role="link"
                        aria-label={`Open statement ${stmt.ref_code}`}
                        onClick={() => setLocation(`/dashboard/${stmt.ref_code}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setLocation(`/dashboard/${stmt.ref_code}`);
                          }
                        }}
                      >
                        <td className="first">
                          <Link
                            href={`/dashboard/${stmt.ref_code}`}
                            className="ref-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {stmt.ref_code}
                          </Link>
                        </td>
                        <td>{stmt.location || 'Unknown'}</td>
                        <td>{new Date(stmt.created_at).toLocaleString()}</td>
                        <td>
                          <StatusBadge status={stmt.status} />
                        </td>
                        <td>
                          <LanguageChip lang={stmt.language_of_call} />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {stmt.intimidation_flag && (
                              <FlagBadge type="intimidation" label="Threatened" />
                            )}
                            {stmt.inconsistency_flags?.length > 0 && (
                              <FlagBadge
                                type="inconsistency"
                                label={`Flagged ${stmt.inconsistency_flags.length}`}
                              />
                            )}
                            {stmt.privacy_mode && (
                              <FlagBadge type="privacy" label="Anonymous" />
                            )}
                          </div>
                        </td>
                        <td style={{ minWidth: 150 }}>
                          {stmt.corroboration_score != null ? (
                            <ScoreBar score={stmt.corroboration_score} />
                          ) : (
                            <span className="text-e-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="pager">
                <button
                  type="button"
                  className="cta-btn"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <span className="cta-sq">←</span>
                  <span className="cta-lbl">Prev</span>
                </button>
                <div className="pager-meta">
                  PAGE {page} / {totalPages}
                  {list ? ` · ${list.total} TOTAL` : ''}
                </div>
                <button
                  type="button"
                  className="cta-btn"
                  disabled={!list || page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <span className="cta-sq">→</span>
                  <span className="cta-lbl">Next</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
