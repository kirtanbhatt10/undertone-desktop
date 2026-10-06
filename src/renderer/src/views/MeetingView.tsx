import { useEffect, useRef, useState } from 'react';
import { formatAccelerator } from '../../../shared/accelerator';
import { MEETING_TOOLS } from '../../../shared/actions';
import { RECORDING_NOTICE } from '../../../shared/defaults';
import { IconMeeting, IconMic, IconPlay, IconPlus, IconRefresh, IconSend, IconSpark, IconStop } from '../components/icons';
import { Markdown } from '../components/Markdown';
import { CopyButton, Modal } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { dateTime, duration } from '../lib/format';
import { ClipRecorder } from '../lib/recorder';
import { appendTranscript, askMeeting, cancelMeetingTool, closeMeeting, patchMeeting, runMeetingTool, startMeeting, stopMeeting, toast, useStore } from '../store';

function Timer({ startedAt, endedAt }: { startedAt: number; endedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (endedAt !== null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [endedAt]);
  return <span className="timer" data-testid="meeting-timer">{duration((endedAt ?? now) - startedAt)}</span>;
}

/** Microphone dictation. Always preceded by an explicit consent prompt. */
function Dictation({ live }: { live: boolean }) {
  const [recording, setRecording] = useState(false);
  const [consent, setConsent] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(0);
  const recorder = useRef<ClipRecorder | null>(null);

  useEffect(() => () => recorder.current?.stop(), []);
  useEffect(() => {
    if (!live && recorder.current?.active) {
      recorder.current.stop();
      setRecording(false);
    }
  }, [live]);

  async function begin(): Promise<void> {
    const rec = new ClipRecorder((audio, mimeType) => {
      setPending((n) => n + 1);
      api
        .transcribe(audio, mimeType)
        .then((text) => text && appendTranscript(text))
        .catch((err: unknown) => toast(errorMessage(err), 'error'))
        .finally(() => setPending((n) => n - 1));
    });
    try {
      await rec.start();
      recorder.current = rec;
      setRecording(true);
    } catch {
      toast('The microphone is unavailable or permission was denied.', 'error');
    }
  }

  function toggle(): void {
    if (recording) {
      recorder.current?.stop();
      setRecording(false);
    } else if (consent) void begin();
    else setAsking(true);
  }

  return (
    <>
      <button type="button" className={`tool-btn${recording ? ' recording' : ''}`} onClick={toggle} disabled={!live} title={recording ? 'Stop dictation' : 'Transcribe from the microphone'} data-testid="dictate">
        <IconMic size={15} />
        <span>{recording ? (pending ? 'Transcribing…' : 'Listening — stop') : 'Dictate'}</span>
      </button>
      {asking && (
        <Modal
          title="Before you record"
          onClose={() => setAsking(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={() => setAsking(false)} data-autofocus>Cancel</button>
              <button type="button" className="btn primary" data-testid="consent-accept" onClick={() => { setConsent(true); setAsking(false); void begin(); }}>
                I have consent — start
              </button>
            </>
          }
        >
          <p className="modal-text" data-testid="recording-notice">{RECORDING_NOTICE}</p>
          <p className="modal-text muted">Audio is recorded from your microphone in short clips, sent to your configured AI provider for transcription, and then discarded. Undertone does not save audio to disk and does not capture other participants’ audio directly.</p>
        </Modal>
      )}
    </>
  );
}

export function MeetingView() {
  const meeting = useStore((s) => s.meeting);
  const busy = useStore((s) => s.meetingBusy);
  const accel = useStore((s) => s.app?.settings.shortcuts.toggleMeeting ?? '');
  const platform = useStore((s) => s.app?.info.platform ?? '');
  const [line, setLine] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [question, setQuestion] = useState('');
  const transcriptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el && document.activeElement !== el) el.scrollTop = el.scrollHeight;
  }, [meeting?.transcript]);

  if (!meeting) {
    return (
      <section className="view meeting-view">
        <div className="empty">
          <span className="empty-icon"><IconMeeting size={26} /></span>
          <h2>Run a meeting with a second brain</h2>
          <p>Start a session, jot the conversation down as it happens, and pull out summaries, decisions, action items and sharp questions whenever you need them.</p>
          <button type="button" className="btn primary large" onClick={() => void startMeeting()} data-testid="start-meeting">
            <IconPlay size={14} /> Start meeting session
          </button>
          <span className="kbd-hint">{formatAccelerator(accel, platform)} from anywhere</span>
        </div>
      </section>
    );
  }

  const live = meeting.endedAt === null;
  const addLine = (): void => {
    appendTranscript(line, speaker);
    setLine('');
  };

  return (
    <section className="view meeting-view">
      <header className="view-head">
        <div className="view-title">
          <input className="title-input" value={meeting.title} maxLength={160} onChange={(e) => patchMeeting({ title: e.target.value })} aria-label="Meeting title" data-testid="meeting-title" />
          <span className={`live-badge${live ? ' live' : ''}`} data-testid="meeting-status">{live ? 'Live' : 'Ended'}</span>
          <Timer startedAt={meeting.startedAt} endedAt={meeting.endedAt} />
        </div>
        <div className="head-actions">
          {live ? (
            <button type="button" className="btn danger" onClick={() => void stopMeeting()} data-testid="stop-meeting"><IconStop size={13} /> End session</button>
          ) : (
            <>
              <span className="muted small">{dateTime(meeting.startedAt)}</span>
              <button type="button" className="btn" onClick={closeMeeting}>Close</button>
              <button type="button" className="btn primary" onClick={() => void startMeeting()} data-testid="new-meeting"><IconPlus size={14} /> New session</button>
            </>
          )}
        </div>
      </header>

      <div className="meeting-grid">
        <div className="meeting-col">
          <div className="card grow">
            <div className="card-head">
              <h3>Transcript</h3>
              <span className="muted small">{meeting.transcript.split('\n').filter((l) => l.trim()).length} lines</span>
            </div>
            <textarea ref={transcriptRef} className="transcript" value={meeting.transcript} onChange={(e) => patchMeeting({ transcript: e.target.value })} placeholder="Type or paste what is being said. Each line you add below is time-stamped." data-testid="transcript" spellCheck={false} />
            <div className="line-input">
              <input className="speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value)} placeholder="Speaker" maxLength={40} aria-label="Speaker" data-testid="speaker" />
              <input value={line} onChange={(e) => setLine(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLine()} placeholder={live ? 'Add a line and press Enter…' : 'Session ended'} disabled={!live} aria-label="Transcript line" data-testid="line-input" />
              <Dictation live={live} />
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>Notes</h3></div>
            <textarea className="notes" value={meeting.notes} onChange={(e) => patchMeeting({ notes: e.target.value })} placeholder="Your own notes — included when generating outputs." rows={5} data-testid="meeting-notes" />
          </div>
        </div>

        <div className="meeting-col">
          <div className="card">
            <div className="card-head"><h3>Ask about this meeting</h3></div>
            <div className="ask-row">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && question.trim()) { void askMeeting(question); setQuestion(''); } }} placeholder="e.g. What did we decide about the launch date?" data-testid="meeting-question" />
              {busy.qa ? (
                <button type="button" className="send stop" onClick={() => cancelMeetingTool('qa')} aria-label="Stop"><IconStop size={14} /></button>
              ) : (
                <button type="button" className="send" disabled={!question.trim()} onClick={() => { void askMeeting(question); setQuestion(''); }} aria-label="Ask" data-testid="meeting-ask"><IconSend size={15} /></button>
              )}
            </div>
            {meeting.qa.length > 0 && (
              <div className="qa-list" data-testid="qa-list">
                {meeting.qa.map((qa) => (
                  <div key={qa.id} className="qa">
                    <strong>{qa.question}</strong>
                    {qa.answer ? <Markdown source={qa.answer} /> : <div className="thinking"><i /><i /><i /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {MEETING_TOOLS.map((tool) => {
            const output = meeting.outputs[tool.kind];
            const running = !!busy[tool.kind];
            return (
              <div key={tool.kind} className="card output" data-testid={`output-${tool.kind}`} data-running={running ? 'true' : 'false'}>
                <div className="card-head">
                  <div>
                    <h3>{tool.label}</h3>
                    <span className="muted small">{tool.blurb}</span>
                  </div>
                  <div className="card-actions">
                    {output && !running && <CopyButton text={output} />}
                    {running ? (
                      <button type="button" className="ghost-btn" onClick={() => cancelMeetingTool(tool.kind)}><IconStop size={13} /> Stop</button>
                    ) : (
                      <button type="button" className="ghost-btn accent" onClick={() => void runMeetingTool(tool.kind)} data-testid={`run-${tool.kind}`}>
                        {output ? <IconRefresh size={13} /> : <IconSpark size={13} />} {output ? 'Refresh' : 'Generate'}
                      </button>
                    )}
                  </div>
                </div>
                {output ? <Markdown source={output} /> : running ? <div className="thinking"><i /><i /><i /></div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
