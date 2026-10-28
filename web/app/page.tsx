import Link from 'next/link';
import { ShareStage } from '@/components/ShareStage';
import { Markdown } from '@/components/Markdown';
import { QUICK_ACTIONS, RELEASES, REPO, SAMPLE_TRANSCRIPT, clock, replyForMeeting } from '@/lib/mock';

const FEATURES = [
  { title: 'Context-aware chat', body: 'Topic, role, expected questions, notes and documents go with every request. One switch pauses them.' },
  { title: 'Screen and image input', body: 'Capture a region with a shortcut, or paste, drop or attach an image and ask about it.' },
  { title: 'Compact floating mode', body: 'A small always-on-top window with a tray icon and dark, light or system theme.' },
  { title: 'Local-first', body: 'History stays on your machine. API keys are encrypted with the OS secure store and never reach the UI.' },
];

const SHORTCUTS = [
  { label: 'Open or close the assistant', keys: ['Ctrl', 'Alt', 'U'] },
  { label: 'Toggle Privacy Mode', keys: ['Ctrl', 'Alt', 'P'] },
  { label: 'Focus the prompt', keys: ['Ctrl', 'Alt', 'A'] },
  { label: 'Capture a screen region', keys: ['Ctrl', 'Alt', 'S'] },
  { label: 'Start or stop a meeting', keys: ['Ctrl', 'Alt', 'M'] },
  { label: 'Toggle compact mode', keys: ['Ctrl', 'Alt', 'K'] },
];

const PLATFORMS = [
  { os: 'Windows 10 2004+ and 11', how: 'SetWindowDisplayAffinity, exclude from capture', result: 'Left out of captures' },
  { os: 'Older Windows', how: 'SetWindowDisplayAffinity, monitor only', result: 'Shown as a black rectangle' },
  { os: 'macOS', how: 'NSWindow sharingType none', result: 'Partial, untested' },
  { os: 'Linux', how: 'No API available', result: 'Not supported, and the app says so' },
];

const DOWNLOADS = [
  { os: 'Windows 10 and 11', file: 'Undertone-Setup-0.1.0-x64.exe', note: 'Installs for the current user, no admin rights' },
  { os: 'Windows, portable', file: 'Undertone-0.1.0-win32-x64.zip', note: 'Unzip anywhere and run Undertone.exe' },
  { os: 'Debian and Ubuntu', file: 'undertone_0.1.0_amd64.deb', note: 'Install with apt, then start from the launcher' },
  { os: 'Linux, portable', file: 'Undertone-0.1.0-linux-x64.zip', note: 'Unzip and run ./undertone' },
];

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M6 13.5c2-3 4-3 6 0s4 3 6 0" fill="none" stroke="var(--lilac)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <header className="nav">
        <a className="brand" href="#top">
          <Logo /> Undertone
        </a>
        <nav>
          <a href="#features">Features</a>
          <a href="#privacy">Privacy Mode</a>
          <a href="#download">Download</a>
          <Link href="/demo/">Demo</Link>
          <a href={REPO}>GitHub</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <h1>Help beside your work, left out of your screen share.</h1>
            <p className="lede">
              Undertone is a floating desktop assistant for meetings, presentations and deep work. Give it context
              once, call it up with a shortcut, and switch on Privacy Mode before you share.
            </p>
            <div className="ctas">
              <a className="btn primary" href={RELEASES}>
                Download for Windows
              </a>
              <Link className="btn" href="/demo/">
                Try it in the browser
              </Link>
            </div>
            <p className="fine">Free and open source. Works with Anthropic, OpenAI, Ollama and LM Studio, or offline in Mock mode.</p>
          </div>
          <ShareStage />
        </section>

        <section className="band context">
          <div className="copy">
            <h2>Tell it the situation once.</h2>
            <p>
              The meeting topic, your role, the questions you expect and your notes are sent with every request, so a
              one-line question gets an answer that fits the room.
            </p>
          </div>
          <div className="context-demo">
            <dl className="context-card">
              <div>
                <dt>Topic</dt>
                <dd>Q3 onboarding review</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>Product lead presenting to leadership</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>Activation +4 pts. Billing tickets doubled. Rollout held at 20%.</dd>
              </div>
            </dl>
            <div className="exchange">
              <p className="ask">Can we roll out to everyone next week?</p>
              <div className="reply">
                <Markdown text="Not yet. Activation is up **four points**, but billing tickets doubled in the same group. Fix the copy first, then move to 50% and watch ticket volume for a week." />
              </div>
            </div>
          </div>
        </section>

        <section className="band" id="features">
          <h2>Ten actions, one click each.</h2>
          <p className="sub">They work on your draft, the last reply or your context documents.</p>
          <ul className="chips">
            {QUICK_ACTIONS.map((a) => (
              <li key={a.id}>{a.label}</li>
            ))}
          </ul>
          <div className="features">
            {FEATURES.map((f) => (
              <div key={f.title} className="feature">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="band meeting">
          <div className="copy">
            <h2>Meetings turn into next steps.</h2>
            <p>
              Run a timed session with a time-stamped transcript and notes. Summary, decisions, action items,
              follow-ups and questions to ask are one click each. Dictation is optional and asks for consent first.
            </p>
          </div>
          <div className="meeting-demo">
            <ol className="transcript">
              {SAMPLE_TRANSCRIPT.slice(0, 5).map((l) => (
                <li key={l.at}>
                  <time>{clock(l.at)}</time>
                  <b>{l.speaker}</b>
                  <span>{l.text}</span>
                </li>
              ))}
            </ol>
            <div className="output">
              <h3>Action items</h3>
              <Markdown text={replyForMeeting('actionItems')} />
            </div>
          </div>
        </section>

        <section className="band">
          <h2>Everything is a shortcut away.</h2>
          <p className="sub">Global shortcuts work while another app has focus, and every one can be changed.</p>
          <ul className="shortcuts">
            {SHORTCUTS.map((s) => (
              <li key={s.label}>
                <span>{s.label}</span>
                <span className="keys">
                  {s.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="band privacy" id="privacy">
          <h2>What Privacy Mode does, and what it doesn’t.</h2>
          <p className="sub">
            It uses the operating system’s documented window-protection API and nothing else. The title bar always
            shows the real state, and a built-in self-test checks it on your machine.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Platform</th>
                  <th scope="col">Mechanism</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {PLATFORMS.map((p) => (
                  <tr key={p.os}>
                    <th scope="row">{p.os}</th>
                    <td>{p.how}</td>
                    <td>{p.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="honest">
            Privacy Mode can’t hide the window from cameras, capture cards, remote-desktop tools or virtual machines. It
            doesn’t hide the process, taskbar entry or network traffic, and it isn’t for getting undisclosed help in
            exams, proctored assessments or interviews that prohibit it.
          </p>
        </section>

        <section className="band download" id="download">
          <h2>Get Undertone.</h2>
          <p className="sub">
            Builds aren’t code-signed yet, so Windows SmartScreen will warn the first time. Check the download against
            SHA256SUMS.txt from the same release.
          </p>
          <ul className="downloads">
            {DOWNLOADS.map((d) => (
              <li key={d.file}>
                <a href={RELEASES}>
                  <b>{d.os}</b>
                  <code>{d.file}</code>
                  <span>{d.note}</span>
                </a>
              </li>
            ))}
          </ul>
          <p className="fine">
            Or run from source: <code>git clone {REPO}.git</code>, then <code>npm install</code> and{' '}
            <code>npm start</code>.
          </p>
        </section>
      </main>

      <footer className="foot">
        <span>
          <Logo /> Undertone, MIT licence
        </span>
        <span>
          <a href={REPO}>Source</a>
          <a href={`${REPO}/blob/main/SECURITY.md`}>Security</a>
          <a href={`${REPO}/blob/main/docs/PRIVACY_MODE.md`}>Privacy Mode details</a>
        </span>
      </footer>
    </>
  );
}
