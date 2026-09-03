import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { useAuth } from '@/lib/auth-context';
import {
  fetchStatement,
  submitReview,
  downloadStatementPdf,
  getStatementAudioUrl,
  fetchStatementAudioSignedUrl,
} from '@/lib/api';
import { PageShell } from '@/components/layout/page-shell';
import {
  StatusBadge,
  LanguageChip,
  FlagBadge,
  ScoreBar,
  DisclaimerBadge,
  UrgentBanner,
} from '@/components/badges';

export default function StatementDetail() {
  const { refCode } = useParams<{ refCode: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: stmt, isLoading, error } = useQuery({
    queryKey: ['statement', refCode],
    queryFn: () => fetchStatement(refCode as string),
    enabled: !!refCode,
  });

  // Signed URL for Storage-backed audio (production); falls back to the
  // legacy direct route for local-disk (dev/demo) audio. Re-fetched on
  // refCode change since the backend's signed URL expires after 5 minutes.
  const { data: audioSrc } = useQuery({
    queryKey: ['statement-audio', refCode],
    queryFn: async () => {
      const signed = await fetchStatementAudioSignedUrl(refCode as string);
      return signed ?? getStatementAudioUrl(refCode as string);
    },
    enabled: !!refCode && !!stmt?.readback_audio_url,
  });

  const reviewMutation = useMutation({
    // reviewed_by is not sent: the backend attributes the review to the
    // verified token holder so it cannot be forged.
    mutationFn: () => submitReview(refCode as string, { reviewer_notes: notes }),
    onSuccess: (data) => {
      queryClient.setQueryData(['statement', refCode], data);
    },
  });

  const handleDownload = async () => {
    if (!refCode) return;
    setIsDownloading(true);
    try {
      const blob = await downloadStatementPdf(refCode);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Statement_${refCode}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Failed to download PDF.');
    } finally {
      setIsDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <PageShell>
        <div className="state-panel" style={{ margin: 32, border: 'none' }}>
          <div className="spinner" />
          <div className="pager-meta">Loading statement</div>
        </div>
      </PageShell>
    );
  }

  if (error || !stmt) {
    return (
      <PageShell>
        <div className="page-content">
          <div className="insight" style={{ borderColor: 'var(--e-warn)' }}>
            <span className="insight-lbl">ERROR</span>
            Reference code not found. Check the 6-character code and try again.
            <div style={{ marginTop: 16 }}>
              <Link href="/dashboard" className="cta-btn">
                <span className="cta-sq">←</span>
                <span className="cta-lbl">Back to Dashboard</span>
              </Link>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const isUrgent = stmt.status === 'urgent_escalation' || stmt.intimidation_flag;

  return (
    <PageShell>
      <div className="page-content page-stack">
        <div className="page-header">
          <div className="section-eyebrow breadcrumb">
            <Link href="/dashboard">DASHBOARD</Link>
            <span className="sep">/</span>
            <span className="text-e-accent">{refCode}</span>
          </div>

          <div className="page-header-row" style={{ alignItems: 'flex-start' }}>
            <div className="hud" style={{ display: 'inline-flex', minHeight: 'auto' }}>
              <div className="hud-v accent vt" style={{ fontSize: 80, letterSpacing: '0.1em' }}>
                {stmt.ref_code}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <StatusBadge status={stmt.status} />
              {stmt.intimidation_flag && <FlagBadge type="intimidation" label="Threatened" />}
              {stmt.inconsistency_flags?.length > 0 && (
                <FlagBadge
                  type="inconsistency"
                  label={`Inconsistencies: ${stmt.inconsistency_flags.length}`}
                />
              )}
              {stmt.privacy_mode && <FlagBadge type="privacy" label="Anonymous" />}
              {stmt.confirmed_by_witness && <FlagBadge type="confirmed" label="Confirmed" />}
              {stmt.delayed_statement_high_risk && (
                <FlagBadge type="delayed" label="Delayed >30 Days" />
              )}
            </div>
          </div>
        </div>

        {isUrgent && <UrgentBanner />}

        <div className="detail-grid">
          <div className="page-stack">
            <div className="bento">
              <div className="bento-h">
                <span className="dot dot-o" />
                STATEMENT.FIELDS
              </div>
              <div className="bento-body kv-grid">
                <div className="kv-k">Time of Incident</div>
                <div className="kv-v">
                  {stmt.time_of_incident || 'Unknown'}
                  {stmt.temporal_uncertainty && (
                    <span style={{ marginLeft: 8 }} className="badge-e badge-gray">
                      Approximate
                    </span>
                  )}
                </div>

                <div className="kv-k">Location</div>
                <div className="kv-v">{stmt.location || 'Unknown'}</div>

                <div className="kv-k">Persons Present</div>
                <div className="kv-v">{stmt.persons_present?.join(', ') || 'None reported'}</div>

                <div className="kv-k">Relationship to Accused</div>
                <div className="kv-v">{stmt.relationship_to_accused || 'N/A'}</div>

                <div className="kv-k">Relationship to Parties</div>
                <div className="kv-v">{stmt.relationship_to_parties || 'N/A'}</div>

                <div className="kv-k">Sequence of Events</div>
                <div className="kv-v">
                  {['ur', 'pa', 'ps'].includes(stmt.language_of_call) ? (
                    <div dir="rtl" className="rtl-block">
                      {stmt.sequence_of_events}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: 'var(--e-paper)',
                        padding: 16,
                        border: '1px solid var(--e-bg-2)',
                        lineHeight: 1.6,
                      }}
                    >
                      {stmt.sequence_of_events}
                    </div>
                  )}
                </div>

                <div className="kv-k">Language</div>
                <div className="kv-v">
                  <LanguageChip lang={stmt.language_of_call} />
                </div>

                <div className="kv-k">Witness Type</div>
                <div className="kv-v text-e-muted">{stmt.witness_type || 'Unknown'}</div>
              </div>
            </div>

            <div className="bento">
              <div className="bento-h">
                <span className="dot dot-k" />
                READBACK.AUDIO
              </div>
              <div className="bento-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <audio
                  controls
                  src={audioSrc}
                  style={{ width: '100%' }}
                  onError={(e) => {
                    (e.target as HTMLAudioElement).style.display = 'none';
                    (e.target as HTMLAudioElement).nextElementSibling?.removeAttribute('hidden');
                  }}
                />
                <div hidden className="text-e-muted" style={{ fontSize: 13 }}>
                  Readback audio not ready
                </div>

                {stmt.readback_text && (
                  <div className="insight">
                    <span className="insight-lbl">TRANSCRIPT</span>
                    {['ur', 'pa', 'ps'].includes(stmt.language_of_call) ? (
                      <div dir="rtl" style={{ textAlign: 'right', fontSize: 16 }}>
                        {stmt.readback_text}
                      </div>
                    ) : (
                      <div>{stmt.readback_text}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="page-stack">
            {stmt.inconsistency_flags && stmt.inconsistency_flags.length > 0 && (
              <div className="bento" style={{ borderColor: 'var(--e-warn)' }}>
                <div
                  className="bento-h"
                  style={{ borderBottomColor: 'var(--e-warn)', color: 'var(--e-warn)' }}
                >
                  <span className="dot dot-o" style={{ background: 'var(--e-warn)' }} />
                  INCONSISTENCIES.DETECTED §16
                </div>
                <div className="bento-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {stmt.inconsistency_flags.map((flag, idx) => (
                    <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <div className="find-panel" style={{ flex: '1 1 220px' }}>
                          <div className="find-head">
                            <span className="find-n">A</span> Segment A
                          </div>
                          <div className="find-body">{flag.segment_a}</div>
                        </div>
                        <div className="find-panel" style={{ flex: '1 1 220px' }}>
                          <div className="find-head">
                            <span className="find-n">B</span> Segment B
                          </div>
                          <div className="find-body">{flag.segment_b}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        {flag.category && (
                          <span className="badge-e badge-orange">{flag.category}</span>
                        )}
                        {flag.score != null && (
                          <div style={{ width: 120 }}>
                            <ScoreBar score={flag.score} />
                          </div>
                        )}
                        {flag.legal_risk && (
                          <span className="text-e-warn" style={{ fontSize: 12 }}>
                            RISK: {flag.legal_risk}
                          </span>
                        )}
                        {flag.source && <span className="badge-e badge-gray">{flag.source}</span>}
                      </div>
                      {idx < stmt.inconsistency_flags.length - 1 && (
                        <div className="e-rule" style={{ marginTop: 4, background: 'var(--e-bg-2)' }} />
                      )}
                    </div>
                  ))}
                  <DisclaimerBadge />
                </div>
              </div>
            )}

            {(stmt.protection?.status !== 'none' || stmt.intimidation_flag) && (
              <div className="bento">
                <div className="bento-h">
                  <span className="dot dot-r" />
                  WITNESS.PROTECTION
                </div>
                <div className="bento-body">
                  {stmt.protection?.status === 'none' && stmt.intimidation_flag ? (
                    <div className="insight" style={{ borderColor: 'var(--e-warn)' }}>
                      <span className="insight-lbl">PENDING</span>
                      Protection assessment pending due to intimidation flag.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {stmt.protection?.applicable_act && (
                        <div className="kv-grid">
                          <div className="kv-k">Act</div>
                          <div className="kv-v">{stmt.protection.applicable_act}</div>
                        </div>
                      )}
                      {stmt.protection?.grounds && stmt.protection.grounds.length > 0 && (
                        <>
                          <div className="kv-k">Grounds</div>
                          <ul className="e-bullets">
                            {stmt.protection.grounds.map((g, i) => (
                              <li key={i}>{g}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {stmt.protection?.referral_pdf_url && (
                        <a
                          href={stmt.protection.referral_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="cta-btn"
                        >
                          <span className="cta-sq">↓</span>
                          <span className="cta-lbl">Download Referral PDF</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {stmt.corroboration_score != null && (
              <div className="bento">
                <div className="bento-h">
                  <span className="dot dot-k" />
                  CORROBORATION.SCORE
                </div>
                <div className="bento-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="hud" style={{ minHeight: 'auto' }}>
                    <div className="hud-v accent">
                      {Math.round(stmt.corroboration_score * 100)}%
                    </div>
                  </div>
                  <DisclaimerBadge />
                  {stmt.incident_cluster_id && (
                    <Link
                      href={`/clusters/${stmt.incident_cluster_id}`}
                      className="cta-btn"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      <span className="cta-sq">→</span>
                      <span className="cta-lbl">View Cluster</span>
                    </Link>
                  )}
                </div>
              </div>
            )}

            <div className="bento">
              <div className="bento-h">
                <span className="dot dot-r" />
                REVIEW
              </div>
              <div className="bento-body">
                {stmt.status === 'reviewed' || stmt.reviewed_by ? (
                  <div className="kv-grid">
                    <div className="kv-k">Reviewed By</div>
                    <div className="kv-v">{stmt.reviewed_by}</div>
                    <div className="kv-k">Date</div>
                    <div className="kv-v">
                      {stmt.reviewed_at ? new Date(stmt.reviewed_at).toLocaleString() : 'N/A'}
                    </div>
                    <div className="kv-k">Notes</div>
                    <div className="kv-v" style={{ whiteSpace: 'pre-wrap' }}>
                      {stmt.reviewer_notes}
                    </div>
                    <div className="kv-k">Status</div>
                    <div className="kv-v">
                      <StatusBadge status={stmt.status} />
                    </div>
                  </div>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      reviewMutation.mutate();
                    }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                  >
                    <div className="filter-group">
                      <span className="e-label">Reviewing as</span>
                      <div className="review-identity">
                        <span className="review-identity-mark" aria-hidden />
                        {user?.email ?? 'Signed-in staff'}
                      </div>
                    </div>
                    <div className="filter-group">
                      <label className="e-label" htmlFor="notes">
                        Notes
                      </label>
                      <textarea
                        id="notes"
                        required
                        rows={4}
                        className="e-textarea"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="cta-btn" disabled={reviewMutation.isPending}>
                      <span className="cta-sq">✓</span>
                      <span className="cta-lbl">
                        {reviewMutation.isPending ? 'Submitting...' : 'Submit Review'}
                      </span>
                    </button>
                  </form>
                )}
              </div>
            </div>

            <button
              type="button"
              className="cta-btn"
              onClick={handleDownload}
              disabled={isDownloading}
              style={{ width: '100%' }}
            >
              <span className="cta-sq">↓</span>
              <span className="cta-lbl" style={{ flex: 1, justifyContent: 'center' }}>
                {isDownloading ? 'Generating PDF...' : 'Download PDF Statement'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
