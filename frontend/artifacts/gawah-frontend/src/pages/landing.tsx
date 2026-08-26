import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { PageShell } from '@/components/layout/page-shell';
import { Reveal } from '@/components/landing/reveal';
import { ScrambleText } from '@/components/landing/scramble-text';
import { HeroSlider } from '@/components/landing/hero-slider';
import { HeroDashboardPreview } from '@/components/landing/hero-dashboard-preview';
import { HeroScreenshotSlide } from '@/components/landing/hero-screenshot-slide';
import { RedactionWidget, RecordWidget, ConvictionBar } from '@/components/landing/problem-visuals';

export default function LandingPage() {
  return (
    <PageShell>
      <div className="land dot-bg">
        {/* ── Hero ── */}
        <section className="land-hero">
          <div className="land-hero-inner">
            <div>
              <motion.div
                className="land-urdu"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
              >
                گواہ
              </motion.div>

              <motion.h1
                className="section-title glitch"
                style={{ fontSize: 'min(92px, 16vw)', marginTop: 8 }}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12 }}
              >
                <ScrambleText text="GAWAH" duration={650} />
              </motion.h1>

              <motion.p
                className="land-tagline"
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
              >
                The Witness That Cannot Be Silenced
              </motion.p>

              <div className="land-rule-row">
                <div className="e-rule" style={{ width: 60 }} />
                <div
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  Phone-only CrPC §161 · Pakistan
                </div>
              </div>

              <div className="land-cta-row">
                <Link id="hero-dashboard-cta" href="/dashboard" className="cta-btn cta-ghost">
                  <span className="cta-sq">→</span>
                  <span className="cta-lbl">Open Dashboard</span>
                </Link>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.22 }}
            >
              <HeroSlider
                slides={[
                  {
                    id: 'meta',
                    label: 'Product meta',
                    content: (
                      <div className="bento">
                        <div className="bento-h">
                          <span className="dot dot-o" />
                          PRODUCT META
                        </div>
                        <div className="bento-body kv-grid">
                          <div className="kv-k">CHANNEL</div>
                          <div className="kv-v">PSTN PHONE · NO APP</div>
                          <div className="kv-k">DOMAIN</div>
                          <div className="kv-v">CRIMINAL JUSTICE</div>
                          <div className="kv-k">COMPLIANCE</div>
                          <div className="kv-v">CRPC §161 / PDPA 2023</div>
                          <div className="kv-k">STATUS</div>
                          <div className="kv-v text-e-accent" style={{ fontWeight: 'bold' }}>
                            LIVE PROTOTYPE
                          </div>
                        </div>
                      </div>
                    ),
                  },
                  {
                    id: 'preview',
                    label: 'Dashboard preview',
                    content: <HeroDashboardPreview />,
                  },
                  {
                    id: 'shot-dashboard',
                    label: 'PREVIEW · DASHBOARD',
                    content: (
                      <HeroScreenshotSlide
                        src="/demo/dashboard.png"
                        label="PREVIEW · DASHBOARD"
                        alt="Gawah case dashboard — statement review queue with status, flags, and corroboration scores"
                      />
                    ),
                  },
                  {
                    id: 'shot-statement',
                    label: 'PREVIEW · STATEMENT',
                    content: (
                      <HeroScreenshotSlide
                        src="/demo/statement-detail.png"
                        label="PREVIEW · STATEMENT"
                        alt="Statement detail view with inconsistency flags and CrPC §162 boundary notice"
                      />
                    ),
                  },
                  {
                    id: 'shot-calls',
                    label: 'PREVIEW · CALL PIPELINE',
                    content: (
                      <HeroScreenshotSlide
                        src="/demo/calls-pipeline.png"
                        label="PREVIEW · CALL PIPELINE"
                        alt="Live call pipeline tracking web and phone testimony sessions"
                      />
                    ),
                  },
                  {
                    id: 'shot-clusters',
                    label: 'PREVIEW · CLUSTERS',
                    content: (
                      <HeroScreenshotSlide
                        src="/demo/clusters.png"
                        label="PREVIEW · CLUSTERS"
                        alt="Incident clusters grouping multi-witness statements by corroboration score"
                      />
                    ),
                  },
                  {
                    id: 'shot-cluster-detail',
                    label: 'PREVIEW · CORROBORATION',
                    content: (
                      <HeroScreenshotSlide
                        src="/demo/cluster-detail.png"
                        label="PREVIEW · CORROBORATION"
                        alt="Field-level corroboration map across witnesses, with collusion check"
                      />
                    ),
                  },
                  {
                    id: 'shot-voice-demo',
                    label: 'PREVIEW · VOICE DEMO',
                    content: (
                      <HeroScreenshotSlide
                        src="/demo/voice-demo.png"
                        label="PREVIEW · VOICE DEMO"
                        alt="Voice demo page for starting a live web or phone call"
                      />
                    ),
                  },
                ]}
                interval={5200}
              />
            </motion.div>
          </div>
        </section>

        <div className="land-band" id="land-band">
          <div className="marquee" style={{ border: 'none' }}>
            <div className="marquee-track">
              GO ON RECORD WITHOUT GOING ON RECORD <span className="marquee-star">▣</span> PHONE-ONLY
              · NO SMARTPHONE <span className="marquee-star">▣</span> CRPC §161 · PDPA 2023{' '}
              <span className="marquee-star">▣</span>
              GO ON RECORD WITHOUT GOING ON RECORD <span className="marquee-star">▣</span> PHONE-ONLY
              · NO SMARTPHONE <span className="marquee-star">▣</span> CRPC §161 · PDPA 2023{' '}
              <span className="marquee-star">▣</span>
            </div>
          </div>
        </div>

        {/* ── Problem ── */}
        <section id="problem" className="land-chapter">
          <Reveal>
            <header className="land-chapter-head">
              <h2 className="land-chapter-title">
                WHY WITNESSES.<span className="accent">WITHDRAW</span>
              </h2>
              <p className="land-chapter-sub">
                Fear of exposure, and paper that gets lost. Gawah fixes both — no station visit
                required.
              </p>
            </header>
          </Reveal>

          <div className="problem-grid">
            <Reveal delay={0.05}>
              <div className="bento" style={{ height: '100%' }}>
                <div className="bento-h">
                  <span className="dot dot-o" />
                  PROBLEM.A · SILENCE
                </div>
                <div className="bento-body">
                  <p style={{ margin: 0, lineHeight: 1.65 }}>
                    Most witnesses never report — fear, not ignorance. Answer: anonymity by
                    design.
                  </p>
                  <RedactionWidget />
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="bento" style={{ height: '100%' }}>
                <div className="bento-h">
                  <span className="dot dot-k" />
                  PROBLEM.B · LOST REPORTS
                </div>
                <div className="bento-body">
                  <p style={{ margin: 0, lineHeight: 1.65 }}>
                    Filed reports vanish into paper and drawers. Answer: an immutable timestamped
                    record.
                  </p>
                  <RecordWidget />
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="bento" style={{ height: '100%' }}>
                <div className="bento-h">
                  <span className="dot dot-r" />
                  CONVICTION.RATE
                </div>
                <div className="bento-body">
                  <p style={{ margin: 0, lineHeight: 1.65 }}>
                    Pakistan's low conviction rate is the stakes — a record that survives is a
                    record that can be used.
                  </p>
                  <ConvictionBar value={8.66} />
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.2}>
            <div className="bento" style={{ marginTop: 16 }}>
              <div className="bento-h">
                <span className="dot dot-o" />
                MISSION · PIPELINE
                <span className="bento-name">TRUTH</span>
              </div>
              <div className="bento-body">
                <div className="pw-timeline">
                  {[
                    {
                      n: '1',
                      label: 'Call received',
                      copy: 'Witness reaches Gawah by phone or web — no app, no literacy required.',
                    },
                    {
                      n: '2',
                      label: 'STT + structure',
                      copy: 'Voice becomes a structured §161 record, in Urdu or Punjabi.',
                    },
                    {
                      n: '3',
                      label: 'Consistency check',
                      copy: 'Live flags catch contradictions before the statement is confirmed.',
                    },
                    {
                      n: '4',
                      label: 'Ref code issued',
                      copy: 'A 6-character code — the durable, anonymous link to the record.',
                    },
                  ].map((step, i) => (
                    <div key={step.n} className={`pw-timeline-step${i === 3 ? ' is-active' : ''}`}>
                      <span className="pw-timeline-dot">{step.n}</span>
                      <div className="pw-timeline-label">{step.label}</div>
                      <p className="pw-timeline-copy">{step.copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Anonymous ── */}
        <section id="anonymous" className="land-chapter">
          <Reveal>
            <header className="land-chapter-head">
              <h2 className="land-chapter-title">
                GO ON RECORD.<span className="accent">ANONYMOUSLY</span>
              </h2>
              <p className="land-chapter-sub">Identity decoupled from statement, by design.</p>
            </header>
          </Reveal>

          <div className="land-sticky-board">
            <Reveal>
              <div className="land-sticky-col">
                <div className="land-quote">
                  <p>For the first time, a witness can go on record without going on record.</p>
                  <div className="land-quote-meta">// Pitch line · Anonymous witness</div>
                </div>
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="land-card-stack">
                <div className="bento">
                  <div className="bento-h">
                    <span className="dot dot-o" />
                    ANONYMITY.MECHANISM
                  </div>
                  <div className="bento-body">
                    <ul className="e-bullets">
                      <li>Caller ID masked from every dashboard view</li>
                      <li>Pseudonym + 6-character reference code — the durable link</li>
                      <li>No PII without explicit consent</li>
                    </ul>
                  </div>
                </div>
                <div className="bento">
                  <div className="bento-h">
                    <span className="dot dot-k" />
                    WHAT THE DASHBOARD SHOWS
                  </div>
                  <div className="bento-body" style={{ fontSize: 14, lineHeight: 1.65 }}>
                    Statement, consistency flags, protection referral — never name or phone number.
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ── Intelligence ── */}
        <section id="intelligence" className="land-chapter">
          <Reveal>
            <header className="land-chapter-head">
              <h2 className="land-chapter-title">
                INTELLIGENCE.<span className="accent">LAYER</span>
              </h2>
              <p className="land-chapter-sub">
                Consistency flags on every call, cluster depth across witnesses. For counsel prep —
                never lie detection, never court corroboration.
              </p>
            </header>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="bento land-diptych">
              <div className="land-diptych-half">
                <div className="land-diptych-label">
                  <span className="dot dot-o" />
                  PER.CALL · CONSISTENCY
                </div>
                <p style={{ margin: 0, lineHeight: 1.65 }}>
                  Flags contradictions within a single statement, live and on a deeper post-call
                  pass — before they surface at trial.
                </p>
                <ul className="e-bullets" style={{ marginTop: 16 }}>
                  <li>Typed flags: temporal · spatial · identity · sequence · numerical</li>
                  <li>Side-by-side A/B quotes on the statement dashboard</li>
                </ul>
              </div>
              <div className="land-diptych-half">
                <div className="land-diptych-label">
                  <span className="dot dot-k" />
                  CLUSTER · CORROBORATION
                </div>
                <p style={{ margin: 0, lineHeight: 1.65 }}>
                  Groups witnesses describing the same incident and maps field-level agreement —
                  who, what, when, where — so lawyers stop cross-referencing by hand.
                </p>
                <ul className="e-bullets" style={{ marginTop: 16 }}>
                  <li>Field map: agreement · partial · conflict · collusion warning</li>
                  <li>Near-identical phrasing flags collusion, not a perfect score</li>
                </ul>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.14}>
            <div className="insight" style={{ marginTop: 24 }}>
              <span className="insight-lbl">§162 BOUNDARY</span>
              Pre-litigation intelligence only — not admissible corroboration under CrPC Section 162.
            </div>
          </Reveal>

          <Reveal delay={0.18}>
            <div className="land-cta-row" style={{ marginTop: 24 }}>
              <Link href="/clusters" className="cta-btn">
                <span className="cta-sq">▣</span>
                <span className="cta-lbl">View Clusters</span>
              </Link>
              <Link href="/dashboard" className="cta-btn cta-ghost">
                <span className="cta-sq">→</span>
                <span className="cta-lbl">Statement Flags</span>
              </Link>
            </div>
          </Reveal>
        </section>

        {/* ── Legal ── */}
        <section id="legal" className="land-chapter">
          <Reveal>
            <header className="land-chapter-head">
              <h2 className="land-chapter-title">
                WHY THIS.<span className="accent">IS LEGAL</span>
              </h2>
              <p className="land-chapter-sub">
                Gawah makes CrPC §161 better — it does not invent §164 standing.
              </p>
            </header>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="land-horizon">
              <article className="land-feature">
                <span className="idx">§161</span>
                <h3>Examination</h3>
                <p>Police-level oral exam, recorded as actually made — not a constable's précis.</p>
              </article>
              <article className="land-feature">
                <span className="idx">§162</span>
                <h3>Not signed</h3>
                <p>§161 statements aren't signed. Voice confirmation + stored audio stand in.</p>
              </article>
              <article className="land-feature">
                <span className="idx">§164</span>
                <h3>Boundary</h3>
                <p>Magistrate statements carry weight Gawah doesn't claim. §161 refreshes memory.</p>
              </article>
              <article className="land-feature">
                <span className="idx">PDPA</span>
                <h3>2023 data law</h3>
                <p>Consent before facts. Purpose-limited, no sale, Pakistan-hosted in production.</p>
              </article>
            </div>
          </Reveal>

          <Reveal delay={0.16}>
            <div className="bento" style={{ marginTop: 20 }}>
              <div className="bento-h">
                <span className="dot dot-r" />
                TECH · COMPLIANCE
              </div>
              <div className="bento-body" style={{ padding: 0, overflowX: 'auto' }}>
                <table className="brutal" style={{ border: 'none' }}>
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Instrument</th>
                      <th>How Gawah meets it</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="first">Procedure</td>
                      <td>CrPC §§161–162</td>
                      <td>Verbatim §161; voice confirm (not signed)</td>
                    </tr>
                    <tr>
                      <td className="first">Data compliance</td>
                      <td>PDPA 2023</td>
                      <td>Consent-first; no PII without it</td>
                    </tr>
                    <tr>
                      <td className="first">Protection</td>
                      <td>Punjab WPA 2018+</td>
                      <td>Auto-referral; provincial routing</td>
                    </tr>
                    <tr>
                      <td className="first">Analysis</td>
                      <td>Consistency engine</td>
                      <td>Contradiction flags — not intent scoring</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Model ── */}
        <section id="model" className="land-chapter">
          <Reveal>
            <header className="land-chapter-head">
              <h2 className="land-chapter-title">
                SOLD.<span className="accent">TO INSTITUTIONS</span>
              </h2>
              <p className="land-chapter-sub">
                Witnesses never pay. Gawah sells to NGOs, law firms, government, and legal-aid
                networks.
              </p>
            </header>
          </Reveal>

          <Reveal delay={0.06}>
            <div className="land-feature-row">
              <article className="land-feature">
                <span className="idx">NGO</span>
                <h3>NGOs &amp; legal aid</h3>
                <p>Dashboard seats for review, flags, and referrals — the launch buyer.</p>
              </article>
              <article className="land-feature">
                <span className="idx">FIRM</span>
                <h3>Law firms</h3>
                <p>Case prep — structured §161 records and multi-witness intelligence.</p>
              </article>
              <article className="land-feature">
                <span className="idx">GOV</span>
                <h3>Government</h3>
                <p>Provincial buyers for scaled intake and FIR-pipeline partnership.</p>
              </article>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="bento" style={{ marginTop: 20 }}>
              <div className="bento-h">
                <span className="dot dot-o" />
                MONETIZATION
              </div>
              <div className="bento-body kv-grid">
                <div className="kv-k">Price</div>
                <div className="kv-v">Org / seat licensing — ~$50–200 / month to start</div>
                <div className="kv-k">Witness</div>
                <div className="kv-v">Statement capture stays free</div>
                <div className="kv-k">Funding</div>
                <div className="kv-v">Grant-eligible (UN Women, USAID) + firm &amp; gov contracts</div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Future ── */}
        <section id="future" className="land-chapter">
          <Reveal>
            <header className="land-chapter-head">
              <h2 className="land-chapter-title">
                FUTURE.<span className="accent">WORK</span>
              </h2>
              <p className="land-chapter-sub">Beyond the PSTN MVP — not shipped claims.</p>
            </header>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="bento">
              <div className="bento-body land-roadmap">
                <div className="land-roadmap-row">
                  <span className="land-roadmap-tag">SIGNAL</span>
                  <p className="land-roadmap-copy">
                    <strong>Lie detection.</strong> Assistive voice-cue analysis for counsel — never
                    a credibility verdict.
                  </p>
                </div>
                <div className="land-roadmap-row">
                  <span className="land-roadmap-tag">PROCESS</span>
                  <p className="land-roadmap-copy">
                    <strong>Deposition management.</strong> Scheduling, roles, and transcript
                    control across a full proceeding.
                  </p>
                </div>
                <div className="land-roadmap-row">
                  <span className="land-roadmap-tag">MOBILE</span>
                  <p className="land-roadmap-copy">
                    <strong>Native phone apps.</strong> iPhone and Android intake, alongside the
                    phone-first PSTN core.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>

        {/* ── Close ── */}
        <section id="close" className="land-close">
          <div className="land-chapter">
            <Reveal>
              <header className="land-chapter-head">
                <h2 className="land-chapter-title">
                  THE ANONYMOUS.<span className="accent">WITNESS</span>
                </h2>
                <p className="land-chapter-sub">
                  Built for NGOs, law firms, legal aid, and government.
                </p>
              </header>
            </Reveal>

            <Reveal delay={0.1}>
              <ul className="e-bullets" style={{ marginTop: 36, maxWidth: 920 }}>
                <li>Voice statement in Urdu / Punjabi — no literacy required</li>
                <li>Anonymous by default — linked to a reference code, not a phone number</li>
                <li>Immutable timestamped record — the lost-report failure mode ends here</li>
              </ul>
            </Reveal>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
