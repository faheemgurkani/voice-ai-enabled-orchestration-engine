import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { fetchClusters } from '@/lib/api';
import { PageShell } from '@/components/layout/page-shell';
import { ScoreBar } from '@/components/badges';

export default function ClustersPage() {
  const { data: list, isLoading, error } = useQuery({
    queryKey: ['clusters'],
    queryFn: fetchClusters,
  });

  return (
    <PageShell>
      <div className="page-content page-stack">
        <div className="page-header">
          <div className="section-eyebrow">// MULTI-WITNESS CORROBORATION §17</div>
          <h1 className="section-title">
            INCIDENT.<span className="accent">CLUSTERS</span>
          </h1>
          <p className="section-sub">
            Field-level agreement across witnesses — pre-litigation intelligence only.
          </p>
          {/* <DisclaimerBadge /> */}
        </div>

        <div>
          {isLoading ? (
            <div className="state-panel">
              <div className="spinner" />
              <div className="pager-meta">Loading clusters</div>
            </div>
          ) : error ? (
            <div className="insight" style={{ borderColor: 'var(--e-warn)' }}>
              <span className="insight-lbl">ERROR</span>
              Error loading clusters.
            </div>
          ) : !list?.items || list.items.length === 0 ? (
            <div className="insight">
              <span className="insight-lbl">EMPTY</span>
              No incident clusters yet. Clusters form when multiple witnesses describe overlapping
              incidents.
            </div>
          ) : (
            <div className="cluster-grid">
              {list.items.map((cluster, idx) => (
                <Link
                  key={cluster.id}
                  href={`/clusters/${cluster.id}`}
                  className={`bento bento-interactive cluster-card${
                    cluster.collusion_warning ? ' cluster-card--alert' : ''
                  }`}
                >
                  <div className="bento-h">
                    <span className="dot dot-o" />
                    CLUSTER.{String(idx + 1).padStart(3, '0')}
                    <span className="bento-name">{cluster.statement_count} STMTS</span>
                  </div>
                  <div className="bento-body cluster-card-body">
                    <div className="cluster-card-title">
                      {cluster.cluster_label?.trim() || 'Untitled incident cluster'}
                    </div>

                    <div className="kv-grid cluster-card-meta">
                      <div className="kv-k">Statements</div>
                      <div className="kv-v vt" style={{ fontSize: 24 }}>
                        {cluster.statement_count}
                      </div>

                      <div className="kv-k">Composite Score</div>
                      <div className="kv-v cluster-card-score">
                        <ScoreBar score={cluster.composite_score} />
                      </div>
                    </div>

                    <div
                      className={`cluster-card-alert${
                        cluster.collusion_warning ? ' is-active' : ''
                      }`}
                    >
                      {cluster.collusion_warning ? (
                        <>
                          <div className="badge-e badge-yellow">COLLUSION CHECK</div>
                          <div className="cluster-card-alert-copy">
                            Unusually high agreement across all fields — requires manual
                            verification.
                          </div>
                        </>
                      ) : (
                        <div className="cluster-card-alert-copy is-muted">
                          No collusion flags on this cluster.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="cluster-card-footer">
                    <div className="cta-btn cluster-card-cta">
                      <span className="cta-sq">→</span>
                      <span className="cta-lbl">View Map</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
