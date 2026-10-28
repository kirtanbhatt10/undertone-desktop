'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Markdown } from './Markdown';
import {
  MEETING_TOOLS,
  QUICK_ACTIONS,
  SAMPLE_TRANSCRIPT,
  clock,
  replyForAction,
  replyForMeeting,
  replyForPrompt,
  streamText,
  type Context,
  type MeetingKind,
  type TranscriptLine,
} from '@/lib/mock';

type View = 'assistant' | 'meeting' | 'history' | 'settings';
type Theme = 'dark' | 'light' | 'system';
interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}
interface Conversation {
  id: string;
  title: string;
  updated: number;
  messages: Msg[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

const SEED_HISTORY: Conversation[] = [
  {
    id: 'seed-1',
    title: 'Board update talking points',
    updated: Date.now() - 1000 * 60 * 60 * 26,
    messages: [
      { id: 'a', role: 'user', text: 'Three talking points for the board update?' },
      { id: 'b', role: 'assistant', text: '- Activation up four points\n- Billing copy is the bottleneck\n- Rollout resumes after Thursday' },
    ],
  },
  {
    id: 'seed-2',
    title: 'Follow-up to the design review',
    updated: Date.now() - 1000 * 60 * 60 * 72,
    messages: [
      { id: 'c', role: 'user', text: 'Write a follow-up to the design review.' },
      { id: 'd', role: 'assistant', text: replyForAction('followup') },
    ],
  },
];

function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable; the demo still works for this visit */
  }
}

const PATHS: Record<string, string> = {
  chat: 'M4 5h16v11H9l-5 4z',
  meeting: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2',
  settings: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  context: 'M5 4h14v16H5zM15 4v16',
  send: 'M4 12l16-8-6 16-2-7z',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13',
  compact: 'M4 14h6v6M20 10h-6V4M14 10l6-6M10 14l-6 6',
  back: 'M15 5l-7 7 7 7',
};

function Icon({ name, size = 18 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function DemoApp() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('assistant');
  const [theme, setTheme] = useState<Theme>('dark');
  const [privacy, setPrivacy] = useState(true);
  const [compact, setCompact] = useState(false);
  const [contextOpen, setContextOpen] = useState(true);
  const [ctx, setCtx] = useState<Context>({ topic: 'Q3 onboarding review', role: 'Product lead', notes: 'Activation +4 pts. Billing tickets doubled.' });
  const [useCtx, setUseCtx] = useState(true);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [convId, setConvId] = useState(uid);
  const [history, setHistory] = useState<Conversation[]>(SEED_HISTORY);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lines, setLines] = useState<TranscriptLine[]>([]);
  const [speaker, setSpeaker] = useState('Me');
  const [line, setLine] = useState('');
  const [output, setOutput] = useState<{ kind: MeetingKind; text: string } | null>(null);

  const cancelRef = useRef<() => void>(() => {});
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTheme(load<Theme>('ut.theme', 'dark'));
    setHistory(load<Conversation[]>('ut.history', SEED_HISTORY));
    setReady(true);
    return () => cancelRef.current();
  }, []);

  useEffect(() => {
    if (!ready) return;
    save('ut.theme', theme);
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => {
      document.documentElement.dataset.app = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, ready]);

  useEffect(() => {
    if (ready) save('ut.history', history);
  }, [history, ready]);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  const notify = useCallback((m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(''), 2400);
  }, []);

  const newConversation = useCallback(() => {
    cancelRef.current();
    setBusy(false);
    setMessages([]);
    setConvId(uid());
    setView('assistant');
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.altKey && e.code === 'KeyP') {
        e.preventDefault();
        setPrivacy((p) => !p);
      } else if (mod && e.altKey && e.code === 'KeyK') {
        e.preventDefault();
        setCompact((c) => !c);
      } else if (mod && !e.altKey && e.code === 'Period') {
        e.preventDefault();
        setContextOpen((c) => !c);
      } else if (mod && e.altKey && e.code === 'KeyN') {
        e.preventDefault();
        newConversation();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [newConversation]);

  const respond = (userText: string, reply: string) => {
    if (busy) return;
    const user: Msg = { id: uid(), role: 'user', text: userText };
    const bot: Msg = { id: uid(), role: 'assistant', text: '' };
    const base = [...messages, user];
    setMessages([...base, bot]);
    setBusy(true);
    cancelRef.current = streamText(
      reply,
      (soFar) => setMessages([...base, { ...bot, text: soFar }]),
      () => {
        setBusy(false);
        const finished = [...base, { ...bot, text: reply }];
        setHistory((h) => [
          { id: convId, title: finished[0].text.slice(0, 48), updated: Date.now(), messages: finished },
          ...h.filter((c) => c.id !== convId),
        ]);
      },
    );
  };

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    respond(text, replyForPrompt(text, ctx, useCtx));
  };

  const quick = (id: string, label: string) => {
    const source = draft.trim() || [...messages].reverse().find((m) => m.role === 'assistant')?.text || ctx.notes;
    setDraft('');
    respond(`${label}: ${source.length > 90 ? `${source.slice(0, 90)}…` : source}`, replyForAction(id));
  };

  const runTool = (kind: MeetingKind) => {
    cancelRef.current();
    if (lines.length === 0) {
      notify('Add a transcript line or load the sample meeting first.');
      return;
    }
    const text = replyForMeeting(kind);
    setOutput({ kind, text: '' });
    cancelRef.current = streamText(text, (t) => setOutput({ kind, text: t }));
  };

  const addLine = () => {
    if (!line.trim()) return;
    setLines((ls) => [...ls, { at: elapsed, speaker: speaker.trim() || 'Me', text: line.trim() }]);
    setLine('');
  };

  const filtered = history.filter((c) => c.title.toLowerCase().includes(query.toLowerCase()));

  const nav: { id: View; label: string; icon: keyof typeof PATHS }[] = [
    { id: 'assistant', label: 'Assistant', icon: 'chat' },
    { id: 'meeting', label: 'Meeting', icon: 'meeting' },
    { id: 'history', label: 'History', icon: 'history' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
  ];

  return (
    <div className="demo-page">
      <div className="demo-top">
        <Link href="/" className="back">
          <Icon name="back" size={16} /> Undertone
        </Link>
        <p>Browser demo with simulated replies. Shortcuts: Ctrl Alt P privacy, Ctrl Alt K compact, Ctrl . context.</p>
      </div>

      <div className={`win${compact ? ' compact' : ''}${privacy ? ' private' : ''}`} data-view={view}>
        <div className="win-bar">
          <span className="win-title">
            <span className="mark" /> Undertone
          </span>
          <span className="win-tools">
            <button type="button" className={`pill${privacy ? ' on' : ''}`} onClick={() => setPrivacy((p) => !p)} aria-pressed={privacy}>
              <Icon name="shield" size={14} />
              {privacy ? 'Hidden from capture' : 'Visible to capture'}
            </button>
            <button type="button" className="icon-btn" onClick={() => setCompact((c) => !c)} aria-label={compact ? 'Leave compact mode' : 'Compact mode'} title="Compact mode">
              <Icon name="compact" size={16} />
            </button>
          </span>
        </div>

        <div className="win-body">
          <nav className="rail" aria-label="Views">
            {nav.map((n) => (
              <button key={n.id} type="button" className={view === n.id ? 'active' : ''} onClick={() => setView(n.id)} aria-current={view === n.id ? 'page' : undefined} title={n.label}>
                <Icon name={n.icon} />
                <span>{n.label}</span>
              </button>
            ))}
          </nav>

          <main className="pane">
            {view === 'assistant' && (
              <div className="assistant">
                <div className="pane-head">
                  <h2>Assistant</h2>
                  <span>
                    <button type="button" className="ghost-btn" onClick={newConversation}>
                      <Icon name="plus" size={15} /> New
                    </button>
                    <button type="button" className={`ghost-btn${contextOpen ? ' on' : ''}`} onClick={() => setContextOpen((c) => !c)} aria-pressed={contextOpen}>
                      <Icon name="context" size={15} /> Context
                    </button>
                  </span>
                </div>
                <div className="messages" ref={listRef}>
                  {messages.length === 0 ? (
                    <div className="empty">
                      <h3>Ask anything, or start from your notes.</h3>
                      <p>Your context goes with every question. Try one of these:</p>
                      <div className="starters">
                        {['What questions should I expect from leadership?', 'Summarize where we are', 'Draft a follow-up message'].map((s) => (
                          <button key={s} type="button" onClick={() => respond(s, replyForPrompt(s, ctx, useCtx))}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className={`msg ${m.role}`}>
                        {m.role === 'assistant' ? <Markdown text={m.text || '…'} /> : <p>{m.text}</p>}
                      </div>
                    ))
                  )}
                </div>
                <div className="actions-row" role="toolbar" aria-label="Quick actions">
                  {QUICK_ACTIONS.map((a) => (
                    <button key={a.id} type="button" disabled={busy} onClick={() => quick(a.id, a.label)}>
                      {a.label}
                    </button>
                  ))}
                </div>
                <form
                  className="composer"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={draft}
                    rows={2}
                    placeholder="Ask about the meeting, your notes, anything"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    aria-label="Message"
                  />
                  <button type="submit" className="send" disabled={busy || !draft.trim()} aria-label="Send">
                    <Icon name="send" size={17} />
                  </button>
                </form>
              </div>
            )}

            {view === 'meeting' && (
              <div className="meeting-view">
                <div className="pane-head">
                  <h2>Meeting</h2>
                  <span>
                    <time className={`timer${running ? ' live' : ''}`}>{clock(elapsed)}</time>
                    <button type="button" className={`ghost-btn${running ? ' stop' : ''}`} onClick={() => setRunning((r) => !r)}>
                      {running ? 'Stop meeting' : 'Start meeting'}
                    </button>
                  </span>
                </div>
                <div className="meeting-grid">
                  <section className="transcript-box" aria-label="Transcript">
                    {lines.length === 0 ? (
                      <div className="empty small">
                        <p>No transcript yet. Type what’s said below, or load a sample meeting to try the tools.</p>
                        <button type="button" className="ghost-btn" onClick={() => setLines(SAMPLE_TRANSCRIPT)}>
                          Load sample meeting
                        </button>
                      </div>
                    ) : (
                      <ol>
                        {lines.map((l, i) => (
                          <li key={i}>
                            <time>{clock(l.at)}</time>
                            <b>{l.speaker}</b>
                            <span>{l.text}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <form
                      className="line-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        addLine();
                      }}
                    >
                      <input value={speaker} onChange={(e) => setSpeaker(e.target.value)} aria-label="Speaker" className="speaker" />
                      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="What was said" aria-label="Transcript line" />
                      <button type="submit" className="ghost-btn">
                        Add
                      </button>
                    </form>
                  </section>
                  <section className="tools-box" aria-label="Meeting tools">
                    <div className="tools">
                      {MEETING_TOOLS.map((t) => (
                        <button key={t.kind} type="button" className={output?.kind === t.kind ? 'on' : ''} onClick={() => runTool(t.kind)}>
                          <b>{t.label}</b>
                          <span>{t.blurb}</span>
                        </button>
                      ))}
                    </div>
                    <div className="tool-out">
                      {output ? <Markdown text={output.text || '…'} /> : <p className="muted">Pick a tool to turn the transcript into something you can use.</p>}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {view === 'history' && (
              <div className="history-view">
                <div className="pane-head">
                  <h2>History</h2>
                  <input type="search" placeholder="Search conversations" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search conversations" />
                </div>
                {filtered.length === 0 ? (
                  <div className="empty small">
                    <p>{query ? 'No conversations match that search.' : 'Conversations you have appear here.'}</p>
                  </div>
                ) : (
                  <ul className="history-list">
                    {filtered.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="open"
                          onClick={() => {
                            cancelRef.current();
                            setBusy(false);
                            setMessages(c.messages);
                            setConvId(c.id);
                            setView('assistant');
                          }}
                        >
                          <b>{c.title}</b>
                          <span>
                            {c.messages.length} messages, {new Date(c.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Delete ${c.title}`}
                          onClick={() => {
                            setHistory((h) => h.filter((x) => x.id !== c.id));
                            notify('Conversation deleted.');
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {view === 'settings' && (
              <div className="settings-view">
                <div className="pane-head">
                  <h2>Settings</h2>
                </div>
                <div className="settings">
                  <fieldset>
                    <legend>Theme</legend>
                    <div className="seg">
                      {(['dark', 'light', 'system'] as Theme[]).map((t) => (
                        <button key={t} type="button" className={theme === t ? 'on' : ''} onClick={() => setTheme(t)} aria-pressed={theme === t}>
                          {t[0].toUpperCase() + t.slice(1)}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>AI provider</legend>
                    <select defaultValue="mock" aria-label="AI provider">
                      <option value="mock">Mock mode (simulated replies)</option>
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="compatible">OpenAI-compatible (Ollama, LM Studio)</option>
                    </select>
                    <p className="muted">The browser demo always uses Mock mode. In the desktop app, keys are encrypted with your OS secure store.</p>
                  </fieldset>
                  <fieldset>
                    <legend>Privacy Mode</legend>
                    <label className="toggle">
                      <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                      <span className="track">
                        <span className="thumb" />
                      </span>
                      Leave this window out of supported screen capture
                    </label>
                    <p className="muted">It can’t protect against cameras, capture cards or remote-desktop tools. The desktop app includes a self-test you can run on your machine.</p>
                  </fieldset>
                  <fieldset>
                    <legend>Window</legend>
                    <label className="toggle">
                      <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
                      <span className="track">
                        <span className="thumb" />
                      </span>
                      Compact floating mode
                    </label>
                  </fieldset>
                </div>
              </div>
            )}
          </main>

          {view === 'assistant' && contextOpen && !compact && (
            <aside className="context-pane" aria-label="Context">
              <div className="pane-head">
                <h2>Context</h2>
                <label className="toggle small">
                  <input type="checkbox" checked={useCtx} onChange={(e) => setUseCtx(e.target.checked)} />
                  <span className="track">
                    <span className="thumb" />
                  </span>
                  {useCtx ? 'In use' : 'Paused'}
                </label>
              </div>
              <label>
                Topic
                <input value={ctx.topic} onChange={(e) => setCtx({ ...ctx, topic: e.target.value })} />
              </label>
              <label>
                Your role
                <input value={ctx.role} onChange={(e) => setCtx({ ...ctx, role: e.target.value })} />
              </label>
              <label>
                Notes
                <textarea rows={6} value={ctx.notes} onChange={(e) => setCtx({ ...ctx, notes: e.target.value })} />
              </label>
              <p className="muted">Sent with every request while in use.</p>
            </aside>
          )}
        </div>
      </div>

      <div className="toast" role="status" aria-live="polite">
        {toast && <span>{toast}</span>}
      </div>
    </div>
  );
}
