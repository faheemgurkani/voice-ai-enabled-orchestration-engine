import { Component, useEffect, useState, type ReactNode } from 'react';
import { Link } from 'wouter';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  completeWebSession,
  createSession,
  fetchActivity,
  fetchCall,
  fetchCalls,
  placePhoneCall,
  postWebEvent,
  type PlaceCallResponse,
  type WebRecordingResponse,
} from '@/lib/api';
import type { SessionCreateResponse } from '@/lib/types';
import { PageShell } from '@/components/layout/page-shell';
import { WebCallRecorder } from '@/components/web-call-recorder';
import { LiveWebCall } from '@/components/live-web-call';
import { TranscriptChat } from '@/components/transcript-chat';
import type { DialogueTurn } from '@/lib/dialogue';

type Mode = 'phone' | 'browser';
type DemoState =
  | 'idle'
  | 'connecting'
  | 'live'
  | 'calling'
  | 'processing'
  | 'ended'
  | 'error';

export default function DemoPage() {
  const [mode, setMode] = useState<Mode>('browser');
  const [demoState, setDemoState] = useState<DemoState>('idle');
  const [session, setSession] = useState<SessionCreateResponse | null>(null);
  const [callInfo, setCallInfo] = useState<PlaceCallResponse | null>(null);
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toolLog, setToolLog] = useState<string[]>([]);
  const [webResult, setWebResult] = useState<WebRecordingResponse | null>(null);
  const [liveFailed, setLiveFailed] = useState(false);
  const [liveRefCode, setLiveRefCode] = useState<string | null>(null);

  const webCallId = session?.callId || session?.sessionId || '';
  const token = session?.token ? String(session.token) : '';
  const wsUrl = String(session?.wsUrl || session?.ws_url || '');
  const canLiveCall =
    Boolean(token && wsUrl) &&
    !session?.demo &&
    !token.startsWith('demo-') &&
    !wsUrl.includes('demo.local') &&
    !liveFailed;

  const pushLog = (line: string) =>
    setToolLog((prev) => {
      if (prev[prev.length - 1] === line) return prev; // drop spam duplicates
      return [...prev.slice(-80), line];
    });

  const startBrowser = useMutation({
    mutationFn: () => createSession('Witness'),
    onMutate: () => {
      setDemoState('connecting');
      setErrorMsg(null);
      setCallInfo(null);
      setWebResult(null);
      setLiveFailed(false);
      setLiveRefCode(null);
      setToolLog([]);
    },
    onSuccess: async (data) => {
      setSession(data);
      setDemoState('live');
      const id = data.callId || data.sessionId || '';
      const live =
        !data.demo &&
        Boolean(data.token && (data.wsUrl || data.ws_url)) &&
        !String(data.token).startsWith('demo-');
      pushLog(
        `[${new Date().toLocaleTimeString()}] Web session ${id} · ${
          live
            ? 'live Uplift WebRTC — same agent as phone'
            : 'live agent unavailable — mic upload fallback (not full agent)'
        }`,
      );
      if (id) {
        await postWebEvent(id, {
          type: 'ui_ready',
          detail: live
            ? 'Live WebRTC web call (agent + tools)'
            : 'Fallback mic upload (no interactive agent)',
          status: 'answered',
        }).catch(() => undefined);
      }
    },
    onError: (err: Error) => {
      setDemoState('error');
      setErrorMsg(err.message || 'Failed to connect to backend.');
    },
  });

  const startPhone = useMutation({
    mutationFn: () => placePhoneCall(phone.trim(), 'Witness'),
    onMutate: () => {
      setDemoState('calling');
      setErrorMsg(null);
      setSession(null);
      setWebResult(null);
      setToolLog([]);
    },
    onSuccess: (data) => {
      setCallInfo(data);
      setDemoState('calling');
      pushLog(
        `[${new Date().toLocaleTimeString()}] Phone call ${data.callId} → ${data.to} (${
          data.mocked ? 'mocked' : 'live PSTN'
        })`,
      );
    },
    onError: (err: Error) => {
      setDemoState('error');
      setErrorMsg(err.message || 'Failed to place call.');
    },
  });

  const trackedId =
    mode === 'phone' ? callInfo?.callId : webCallId || undefined;

  const { data: trackedCall, refetch: refetchCall } = useQuery({
    queryKey: ['call', trackedId],
    queryFn: () => fetchCall(trackedId!),
    enabled: !!trackedId && (demoState === 'calling' || demoState === 'live'),
    refetchInterval:
      demoState === 'calling' || demoState === 'live' ? 3000 : false,
  });

  const { data: callsList } = useQuery({
    queryKey: ['calls-preview'],
    queryFn: () => fetchCalls(8),
    enabled: demoState === 'calling' || demoState === 'live',
    refetchInterval:
      demoState === 'calling' || demoState === 'live' ? 3000 : false,
  });

  const { data: activity } = useQuery({
    queryKey: ['activity-live'],
    queryFn: () => fetchActivity(24),
    enabled: demoState === 'calling' || demoState === 'live' || demoState === 'ended',
    refetchInterval: 2500,
  });

  useEffect(() => {
    const item = trackedCall?.item;
    if (!item) return;
    if (demoState === 'calling') {
      const status = String(item.status || item.state || '').toLowerCase();
      setCallInfo((prev) =>
        prev
          ? {
              ...prev,
              status,
              label: item.label,
              message: item.label || prev.message,
            }
          : prev,
      );
      if (status === 'completed' || status === 'failed') setDemoState('ended');
    }
  }, [trackedCall, demoState]);

  const reset = () => {
    setSession(null);
    setCallInfo(null);
    setErrorMsg(null);
    setWebResult(null);
    setToolLog([]);
    setDemoState('idle');
  };

  const endWeb = async () => {
    if (webCallId) {
      await completeWebSession(webCallId).catch(() => undefined);
      pushLog(`[${new Date().toLocaleTimeString()}] Web session ended`);
    }
    setDemoState('ended');
  };

  return (
    <PageShell>
      <div className="page-content" style={{ maxWidth: 820 }}>
        <div className="page-header" style={{ marginBottom: 28 }}>
          <div className="section-eyebrow">// SECTION : DEMO · 002</div>
          <h1 className="section-title">
            VOICE <span className="accent">DEMO</span>
          </h1>
          <p className="section-sub">
            Report an incident by <strong>web call</strong> (browser recorder → backend
            transcript/statement) or by <strong>phone</strong> (Uplift PSTN). Both paths are
            tracked live on the Calls dashboard.
          </p>
        </div>

        <div className="filter-chips" style={{ marginBottom: 24 }}>
          <button
            type="button"
            className={`filter-chip ${mode === 'browser' ? 'active' : ''}`}
            onClick={() => {
              setMode('browser');
              reset();
            }}
          >
            <span className="mark" />
            Web call (demo)
          </button>
          <button
            type="button"
            className={`filter-chip ${mode === 'phone' ? 'active' : ''}`}
            onClick={() => {
              setMode('phone');
              reset();
            }}
          >
            <span className="mark" />
            Phone call
          </button>
        </div>

        <div className="page-stack">
          {demoState === 'idle' && mode === 'phone' && (
            <div className="bento">
              <div className="bento-h">
                <span className="dot dot-o" />
                PHONE.CALL · OUTBOUND
              </div>
              <div className="bento-body">
                <p style={{ fontSize: 16, marginBottom: 16, lineHeight: 1.6 }}>
                  Enter your Pakistani mobile. Uplift AI calls you from a Pakistan caller ID.
                  Answer and give your statement in Urdu or Punjabi.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    startPhone.mutate();
                  }}
                  className="page-stack"
                  style={{ gap: 16 }}
                >
                  <div className="filter-group">
                    <label className="e-label" htmlFor="phone">
                      Your mobile (+92 / 03…)
                    </label>
                    <input
                      id="phone"
                      className="e-input"
                      type="tel"
                      inputMode="tel"
                      placeholder="+923001234567"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="cta-btn" disabled={!phone.trim()}>
                    <span className="cta-sq">☎</span>
                    <span className="cta-lbl">Call me</span>
                  </button>
                </form>
              </div>
            </div>
          )}

          {demoState === 'idle' && mode === 'browser' && (
            <div className="bento">
              <div className="bento-h">
                <span className="dot dot-o" />
                WEB.CALL · LIVE VOICE
              </div>
              <div className="bento-body">
                <p style={{ fontSize: 16, marginBottom: 24, lineHeight: 1.6 }}>
                  Live browser WebRTC with the same Gawah agent as phone — Phase 0 caution,
                  §161 fields, privacy / intimidation / protection tools, readback, and spoken
                  confirmation. Mic on; talk continuously.
                </p>
                {/*
                <div className="insight" style={{ marginBottom: 24 }}>
                  <span className="insight-lbl">LIKE PSTN</span>
                  Connect → speak → agent saves mid-call → hang up. Dashboard updates live.
                </div>
                */}
                <button
                  type="button"
                  className="cta-btn"
                  onClick={() => startBrowser.mutate()}
                >
                  <span className="cta-sq">●</span>
                  <span className="cta-lbl">Start live web call</span>
                </button>
              </div>
            </div>
          )}

          {(demoState === 'connecting' || (demoState === 'calling' && !callInfo)) && (
            <div className="state-panel" style={{ borderStyle: 'solid' }}>
              <div className="spinner" />
              <div className="pager-meta">
                {demoState === 'calling' ? 'Dispatching phone call' : 'Creating web session'}
              </div>
            </div>
          )}

          {demoState === 'calling' && callInfo && (
            <div className="page-stack">
              <div className="live-pill">
                <span className="pulse-dot" />
                CALL {String(callInfo.status || 'dispatched').toUpperCase()}
              </div>
              <div className="bento">
                <div className="bento-h">
                  <span className="dot dot-o" />
                  CALL.META · REAL UPLIFT
                </div>
                <div className="bento-body kv-grid">
                  <div className="kv-k">Mocked</div>
                  <div className="kv-v">{callInfo.mocked ? 'YES' : 'NO — live PSTN'}</div>
                  <div className="kv-k">To</div>
                  <div className="kv-v">{callInfo.to}</div>
                  <div className="kv-k">Call ID</div>
                  <div className="kv-v">{callInfo.callId}</div>
                  <div className="kv-k">Status</div>
                  <div className="kv-v text-e-accent">{callInfo.status}</div>
                  <div className="kv-k">Detail</div>
                  <div className="kv-v">
                    {trackedCall?.item?.label || callInfo.label || callInfo.message}
                  </div>
                </div>
              </div>
              <LivePanels
                callsList={callsList?.items}
                activity={activity?.items}
                onRefresh={() => refetchCall()}
                onDone={reset}
              />
            </div>
          )}

          {(demoState === 'live' || demoState === 'processing') && session && webCallId && (
            <div className="page-stack">
              {demoState === 'processing' && <AudioProcessingPanel />}

              {/* Keep call UI mounted (hidden) so End-call upload can finish */}
              <div
                className="page-stack"
                hidden={demoState === 'processing'}
                aria-hidden={demoState === 'processing'}
              >
                <div className="live-pill">
                  <span className="pulse-dot" />
                  WEB CALL{' '}
                  {String(
                    trackedCall?.item?.status || session.status || 'LIVE',
                  ).toUpperCase()}
                </div>
                <div className="bento">
                  <div className="bento-h">
                    <span className="dot dot-o" />
                    SESSION.META
                  </div>
                  <div className="bento-body kv-grid">
                    <div className="kv-k">Call / session ID</div>
                    <div className="kv-v">{webCallId}</div>
                    <div className="kv-k">Room</div>
                    <div className="kv-v">{session.roomName || session.room_name}</div>
                    <div className="kv-k">Channel</div>
                    <div className="kv-v">web_browser</div>
                    <div className="kv-k">Mode</div>
                    <div className="kv-v">
                      {canLiveCall ? (
                        <span className="badge-e badge-teal">Live WebRTC · agent + tools</span>
                      ) : (
                        <span className="badge-e badge-amber">
                          Fallback mic upload — not full agent
                        </span>
                      )}
                    </div>
                    {(webResult?.ref_code || liveRefCode) && (
                      <>
                        <div className="kv-k">Ref code</div>
                        <div className="kv-v text-e-accent">
                          {webResult?.ref_code || liveRefCode}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {!webResult && canLiveCall && (
                  <LiveSdkBoundary
                    onError={() => {
                      setLiveFailed(true);
                      pushLog(
                        `[${new Date().toLocaleTimeString()}] Live SDK failed — switching to continuous mic call`,
                      );
                    }}
                  >
                    <LiveWebCall
                      token={token}
                      wsUrl={wsUrl}
                      callId={webCallId}
                      onLog={pushLog}
                      onTool={(ev) => {
                        if (ev.refCode) setLiveRefCode(ev.refCode);
                      }}
                      onProcessing={() => {
                        setDemoState('processing');
                        pushLog(
                          `[${new Date().toLocaleTimeString()}] Processing audio — STT → §161 fields…`,
                        );
                      }}
                      onEnded={(result) => {
                        if (result?.ref_code) {
                          setLiveRefCode(result.ref_code);
                          setWebResult(result);
                        } else if (result) {
                          setWebResult(result);
                        }
                        setDemoState('ended');
                      }}
                    />
                  </LiveSdkBoundary>
                )}

                {!webResult && !canLiveCall && (
                  <div className="page-stack">
                    <div className="insight" style={{ borderColor: 'var(--e-warn)' }}>
                      <span className="insight-lbl">LIVE AGENT UNAVAILABLE</span>
                      Uplift WebRTC credentials are missing or the SDK failed. The mic upload below
                      is a backup (STT → statement after End) — it is not the interactive phone-parity
                      agent. Fix UPLIFTAI_API_KEY / Singapore base URL and retry live web call.
                    </div>
                    <WebCallRecorder
                      callId={webCallId}
                      autoStart={false}
                      onLog={pushLog}
                      onProcessing={() => {
                        setDemoState('processing');
                        pushLog(
                          `[${new Date().toLocaleTimeString()}] Processing audio — STT → §161 fields…`,
                        );
                      }}
                      onProcessed={(r) => {
                        setWebResult(r);
                        setDemoState('ended');
                      }}
                      onStatus={(s) =>
                        pushLog(`[${new Date().toLocaleTimeString()}] Status → ${s}`)
                      }
                    />
                  </div>
                )}

                <div className="find-panel activity-log">
                  <div className="find-head">
                    <span className="find-n">LIVE</span>
                    <span className="find-title">Activity log</span>
                  </div>
                  <div className="find-body activity-log-body">
                    {toolLog.length === 0 && (
                      <div className="activity-log-empty">Waiting for events…</div>
                    )}
                    <AnimatePresence initial={false}>
                      {toolLog.map((line, i) => (
                        <motion.div
                          key={`${i}-${line}`}
                          className="activity-log-line"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {line}
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </div>

                <LivePanels
                  callsList={callsList?.items}
                  activity={activity?.items}
                  onRefresh={() => refetchCall()}
                  onDone={() => void endWeb()}
                />
              </div>
            </div>
          )}

          {demoState === 'ended' && (
            <div className="page-stack">
              <div className="bento">
                <div className="bento-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12 }}>
                    {webResult
                      ? `Processing complete · ref ${webResult.ref_code}`
                      : liveRefCode
                        ? `Processing complete · ref ${liveRefCode}`
                        : callInfo
                          ? 'Call finished. Check the dashboard for your statement / reference code.'
                          : 'Session ended. Check the dashboard for your statement.'}
                  </div>
                  {(webResult?.ref_code || liveRefCode) && (
                    <p
                      className="pager-meta"
                      style={{ marginBottom: 24, maxWidth: 420, marginInline: 'auto' }}
                    >
                      Your audio is saved. Open the statement, Calls pipeline, or review the
                      full dialogue below.
                    </p>
                  )}
                  <div
                    className="demo-ended-actions"
                    style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}
                  >
                    {(webResult?.ref_code || liveRefCode) && (
                      <Link
                        href={`/dashboard/${webResult?.ref_code || liveRefCode}`}
                        className="cta-btn"
                      >
                        <span className="cta-sq">→</span>
                        <span className="cta-lbl">Open statement</span>
                      </Link>
                    )}
                    <Link href="/calls" className="cta-btn">
                      <span className="cta-sq">→</span>
                      <span className="cta-lbl">Calls pipeline</span>
                    </Link>
                    <Link href="/dashboard" className="cta-btn cta-ghost">
                      <span className="cta-sq">→</span>
                      <span className="cta-lbl">Dashboard</span>
                    </Link>
                    <button type="button" className="cta-btn cta-ghost" onClick={reset}>
                      <span className="cta-sq">↻</span>
                      <span className="cta-lbl">New session</span>
                    </button>
                  </div>
                  {(webResult?.dialogue?.length || webResult?.transcript) && (
                    <div style={{ marginTop: 24, textAlign: 'left' }}>
                      <TranscriptChat
                        turns={(webResult.dialogue || []) as DialogueTurn[]}
                        fallbackText={webResult.transcript}
                        title="مکمل بات چیت"
                        emptyHint="اس سیشن کی کوئی بات چیت محفوظ نہیں ہوئی۔"
                      />
                    </div>
                  )}
                </div>
              </div>
              <LivePanels
                callsList={callsList?.items}
                activity={activity?.items}
                onRefresh={() => refetchCall()}
                onDone={reset}
              />
            </div>
          )}

          {demoState === 'error' && (
            <div className="bento" style={{ borderColor: 'var(--e-warn)' }}>
              <div
                className="bento-h"
                style={{ borderBottomColor: 'var(--e-warn)', color: 'var(--e-warn)' }}
              >
                <span className="dot dot-o" style={{ background: 'var(--e-warn)' }} />
                CONNECTION.ERROR
              </div>
              <div className="bento-body">
                <p style={{ marginBottom: 24 }}>{errorMsg}</p>
                <button type="button" className="cta-btn" onClick={reset}>
                  <span className="cta-sq">↻</span>
                  <span className="cta-lbl">Back</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}

const PROCESSING_STEPS = [
  { key: 'upload', label: 'Uploading your recording' },
  { key: 'stt', label: 'Transcribing speech (Urdu STT)' },
  { key: 'structure', label: 'Structuring §161 fields' },
  { key: 'save', label: 'Saving to dashboard records' },
] as const;

function AudioProcessingPanel() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % PROCESSING_STEPS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="bento audio-processing">
      <div className="bento-h">
        <span className="dot dot-o" />
        PROCESSING.AUDIO
      </div>
      <div className="bento-body">
        <div className="audio-processing-panel">
          <div className="audio-processing-orb" aria-hidden>
            <span className="audio-processing-ring" />
            <span className="audio-processing-ring audio-processing-ring--delay" />
            <div className="spinner audio-processing-spinner" />
          </div>
          <h2 className="audio-processing-title">Audio is being processed</h2>
          <p className="audio-processing-sub">
            Hang tight — we are turning your recording into a transcript and §161 statement.
            When this finishes you can open it from the dashboard, Calls pipeline, or the
            dialogue below.
          </p>
          <ol className="audio-processing-steps">
            {PROCESSING_STEPS.map((item, i) => (
              <li
                key={item.key}
                className={
                  i === step
                    ? 'audio-processing-step is-active'
                    : i < step
                      ? 'audio-processing-step is-done'
                      : 'audio-processing-step'
                }
              >
                <span className="audio-processing-step-mark" aria-hidden>
                  {i < step ? '✓' : i === step ? '●' : '○'}
                </span>
                <span>{item.label}</span>
              </li>
            ))}
          </ol>
          <div className="pager-meta" style={{ marginTop: 8 }}>
            This usually takes a few seconds…
          </div>
        </div>
      </div>
    </div>
  );
}

class LiveSdkBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function LivePanels({
  callsList,
  activity,
  onRefresh,
  onDone,
}: {
  callsList?: Array<Record<string, unknown>>;
  activity?: Array<{
    call_id?: string;
    channel?: string;
    status?: string;
    type?: string;
    detail?: string;
    at?: string;
  }>;
  onRefresh: () => void;
  onDone: () => void;
}) {
  return (
    <div className="find-panel demo-pipeline">
      <div className="find-head">
        <span className="find-n">LIVE</span>
        <span className="find-title">Pipeline feed</span>
      </div>
      <div className="find-body activity-log-body">
        <AnimatePresence initial={false}>
          {(activity || []).slice(0, 8).map((item, idx) => (
            <motion.div
              key={idx}
              className="activity-log-line"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              [{item.channel || '?'}] {item.type || 'event'} · {item.status || '—'}
              {item.detail ? ` — ${String(item.detail).slice(0, 80)}` : ''}
            </motion.div>
          ))}
        </AnimatePresence>
        {!activity?.length &&
          (callsList || []).slice(0, 6).map((item, idx) => (
            <div key={idx} className="activity-log-line">
              {String(item.status || item.state || 'unknown')}
              {item.channel ? ` · ${String(item.channel)}` : ''}
              {item.to ? ` · ${String(item.to)}` : ''}
            </div>
          ))}
        {!activity?.length && !callsList?.length && (
          <div className="activity-log-empty">Waiting for session updates…</div>
        )}
      </div>
      <div className="demo-actions">
        <button type="button" className="cta-btn cta-ghost" onClick={onRefresh}>
          <span className="cta-sq">↻</span>
          <span className="cta-lbl">Refresh</span>
        </button>
        <Link href="/calls" className="cta-btn">
          <span className="cta-sq">→</span>
          <span className="cta-lbl">Calls</span>
        </Link>
        <button type="button" className="cta-btn cta-ghost" onClick={onDone}>
          <span className="cta-sq">■</span>
          <span className="cta-lbl">Done</span>
        </button>
      </div>
    </div>
  );
}
