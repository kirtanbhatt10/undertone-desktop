import { type ReactNode, useEffect, useState } from 'react';
import { acceleratorFromEvent, formatAccelerator, validateAccelerator } from '../../../shared/accelerator';
import { DEFAULT_SHORTCUTS, MODEL_SUGGESTIONS, PRIVACY_NOTICE, SHORTCUT_LABELS } from '../../../shared/defaults';
import { type PrivacyAffinityCheck, type PrivacySelfTest, type ProviderId, SHORTCUT_ACTIONS, type ShortcutAction } from '../../../shared/types';
import { IconAlert, IconCheck, IconFolder, IconKey, IconRefresh, IconShieldOn, IconTrash, Logo } from '../components/icons';
import { ConfirmModal, Segmented, Toggle } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { clearAllHistory, clearApiKey, resetAllData, setApiKey, setPrivacy, toast, updateSettings, useStore } from '../store';

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="settings-section" id={`settings-${id}`} data-testid={`settings-${id}`}>
      <div className="settings-section-head">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="settings-card">{children}</div>
    </section>
  );
}

function Row({ title, hint, children, stack }: { title: string; hint?: ReactNode; children: ReactNode; stack?: boolean }) {
  return (
    <div className={`row${stack ? ' stack' : ''}`}>
      <div className="row-text">
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div className="row-control">{children}</div>
    </div>
  );
}

const SOURCE_TEXT = {
  stored: 'Saved in secure storage',
  session: 'In memory for this session',
  env: 'From environment variable',
  none: 'Not configured',
} as const;

function KeyField({ provider }: { provider: 'anthropic' | 'openai' }) {
  const source = useStore((s) => s.app?.keyStatus[provider] ?? 'none');
  const encryption = useStore((s) => s.app?.keyStatus.encryptionAvailable ?? false);
  const [value, setValue] = useState('');
  const envName = provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  return (
    <Row
      stack
      title="API key"
      hint={
        <>
          <span className={`key-status ${source}`} data-testid="key-status">{source === 'none' ? <IconAlert size={12} /> : <IconCheck size={12} />} {SOURCE_TEXT[source]}</span>
          {' · '}Keys stay in the main process and are never shown again after saving. You can also set <code>{envName}</code>.
          {!encryption && ' Secure storage is unavailable on this system, so a key entered here is kept in memory only and must be re-entered after a restart.'}
        </>
      }
    >
      <div className="inline">
        <label className="input-icon">
          <IconKey size={14} />
          <input type="password" autoComplete="off" spellCheck={false} value={value} onChange={(e) => setValue(e.target.value)} placeholder={source === 'none' ? 'Paste your API key' : 'Replace key…'} data-testid="api-key" />
        </label>
        <button type="button" className="btn primary" disabled={value.trim().length < 8} onClick={() => void setApiKey(provider, value.trim()).then((ok) => ok && setValue(''))} data-testid="save-key">Save</button>
        {(source === 'stored' || source === 'session') && (
          <button type="button" className="btn" onClick={() => void clearApiKey(provider)} data-testid="remove-key">Remove</button>
        )}
      </div>
    </Row>
  );
}

function ModelField({ provider }: { provider: ProviderId }) {
  const saved = useStore((s) => s.app?.settings.models[provider] ?? '');
  const [value, setValue] = useState(saved);
  const [models, setModels] = useState<string[]>([...MODEL_SUGGESTIONS[provider]]);
  const [loading, setLoading] = useState(false);
  useEffect(() => setValue(saved), [saved]);
  useEffect(() => setModels([...MODEL_SUGGESTIONS[provider]]), [provider]);

  const commit = (): void => {
    const next = value.trim();
    if (next && next !== saved) void updateSettings({ models: { [provider]: next } }).then((ok) => !ok && setValue(saved));
    else setValue(saved);
  };

  return (
    <Row title="Model" hint="Any model identifier your provider accepts. Fetch the current list from the provider, or type one.">
      <div className="inline">
        <input list={`models-${provider}`} value={value} onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} spellCheck={false} data-testid="model" />
        <datalist id={`models-${provider}`}>{models.map((m) => <option key={m} value={m} />)}</datalist>
        <button
          type="button"
          className="btn"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            api
              .listModels(provider)
              .then((list) => {
                setModels(list);
                toast(`${list.length} model${list.length === 1 ? '' : 's'} available`);
              })
              .catch((err: unknown) => toast(errorMessage(err), 'error'))
              .finally(() => setLoading(false));
          }}
          data-testid="fetch-models"
        >
          <IconRefresh size={13} /> {loading ? 'Fetching…' : 'Fetch'}
        </button>
      </div>
    </Row>
  );
}

function TextSetting({ value, onCommit, testId, type = 'text', width }: { value: string; onCommit: (v: string) => Promise<boolean>; testId?: string; type?: string; width?: number }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      type={type}
      value={draft}
      style={width ? { width } : undefined}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() === value) return setDraft(value);
        void onCommit(draft.trim()).then((ok) => !ok && setDraft(value));
      }}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      data-testid={testId}
    />
  );
}

function ShortcutRow({ action }: { action: ShortcutAction }) {
  const status = useStore((s) => s.app?.shortcuts.find((x) => x.action === action));
  const accel = useStore((s) => s.app?.settings.shortcuts[action] ?? '');
  const platform = useStore((s) => s.app?.info.platform ?? '');
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const label = SHORTCUT_LABELS[action];

  return (
    <Row title={label.title} hint={error || (status && !status.registered ? status.error : label.hint)}>
      <div className="inline">
        {status && !status.registered && !recording && <span className="badge warn" data-testid={`shortcut-warn-${action}`}>Not active</span>}
        <button
          type="button"
          className={`shortcut${recording ? ' recording' : ''}`}
          data-testid={`shortcut-${action}`}
          onClick={() => { setRecording(true); setError(''); }}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return;
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') return setRecording(false);
            const next = acceleratorFromEvent(e.nativeEvent, platform);
            if (!next) return;
            const valid = validateAccelerator(next);
            if (!valid.ok) return setError(valid.reason);
            setRecording(false);
            void updateSettings({ shortcuts: { [action]: next } });
          }}
        >
          {recording ? 'Press keys…' : formatAccelerator(accel, platform)}
        </button>
        <button type="button" className="icon-btn" title="Restore default" aria-label="Restore default shortcut" disabled={accel === DEFAULT_SHORTCUTS[action]} onClick={() => void updateSettings({ shortcuts: { [action]: DEFAULT_SHORTCUTS[action] } })}>
          <IconRefresh size={14} />
        </button>
      </div>
    </Row>
  );
}

function PrivacySection() {
  const privacy = useStore((s) => s.app?.privacy);
  const accel = useStore((s) => s.app?.settings.shortcuts.togglePrivacy ?? '');
  const platform = useStore((s) => s.app?.info.platform ?? '');
  const [affinity, setAffinity] = useState<PrivacyAffinityCheck | null>(null);
  const [test, setTest] = useState<PrivacySelfTest | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => {
    setAffinity(null);
    setTest(null);
  }, [privacy?.enabled]);
  if (!privacy) return null;
  const { capability, enabled } = privacy;
  const levelText = { full: 'Supported', partial: 'Partially supported', unsupported: 'Not supported on this system' }[capability.level];

  return (
    <Section id="privacy" title="Privacy Mode" description="Keeps the Undertone window out of screenshots and screen sharing, using the operating system’s own window-protection API.">
      <Row title="Privacy Mode" hint={`Toggle from anywhere with ${formatAccelerator(accel, platform)}. The window stays visible to you.`}>
        <Toggle checked={enabled} onChange={(v) => void setPrivacy(v)} label="Privacy Mode" />
      </Row>
      <div className={`capability ${capability.level}`} data-testid="privacy-capability" data-level={capability.level}>
        <div className="capability-head">
          <IconShieldOn size={16} />
          <strong>{levelText}</strong>
          <code>{capability.mechanism}</code>
        </div>
        <p>{capability.detail}</p>
      </div>
      <p className="notice" data-testid="privacy-notice">{PRIVACY_NOTICE}</p>
      <Row stack title="Check it on this machine" hint="The self-test takes a single screenshot through the OS capture API while the window briefly shows a test colour, then looks for that colour. Nothing is saved.">
        <div className="inline wrap">
          <button
            type="button"
            className="btn"
            disabled={!!busy}
            data-testid="privacy-selftest"
            onClick={() => {
              setBusy('test');
              api.privacySelfTest().then(setTest).catch((err: unknown) => toast(errorMessage(err), 'error')).finally(() => setBusy(''));
            }}
          >
            {busy === 'test' ? 'Testing…' : 'Run capture self-test'}
          </button>
          {platform === 'win32' && (
            <button
              type="button"
              className="btn"
              disabled={!!busy}
              onClick={() => {
                setBusy('affinity');
                api.verifyPrivacy().then(setAffinity).catch((err: unknown) => toast(errorMessage(err), 'error')).finally(() => setBusy(''));
              }}
            >
              {busy === 'affinity' ? 'Reading…' : 'Read window display affinity'}
            </button>
          )}
        </div>
        {test && <p className={`result ${test.verdict}`} data-testid="privacy-result" data-verdict={test.verdict}>{test.message}</p>}
        {affinity && <p className={`result ${affinity.ok ? 'protected' : 'exposed'}`}>{affinity.supported ? `Windows reports: ${affinity.label}` : affinity.label}</p>}
      </Row>
    </Section>
  );
}

export function SettingsView() {
  const app = useStore((s) => s.app);
  const [confirm, setConfirm] = useState<'history' | 'reset' | null>(null);
  if (!app) return null;
  const { settings, info } = app;
  const provider = settings.provider;
  const loginSupported = info.isPackaged && (info.platform === 'win32' || info.platform === 'darwin');

  return (
    <section className="view settings-view">
      <header className="view-head">
        <div className="view-title"><h1>Settings</h1></div>
      </header>
      <div className="settings-scroll">
        <Section id="ai" title="AI provider" description="Undertone talks to the provider directly from your computer. Switch providers at any time.">
          <Row title="Provider" hint={app.effectiveProvider === 'mock' && provider !== 'mock' ? 'No key configured yet — replies are simulated until you add one.' : 'Mock mode answers offline for trying the app out.'}>
            <Segmented label="Provider" value={provider} onChange={(v) => void updateSettings({ provider: v })} options={[{ value: 'anthropic', label: 'Anthropic' }, { value: 'openai', label: 'OpenAI-compatible' }, { value: 'mock', label: 'Mock' }]} />
          </Row>
          {provider !== 'mock' && <KeyField provider={provider} key={provider} />}
          <ModelField provider={provider} key={`m-${provider}`} />
          {provider === 'openai' && (
            <>
              <Row title="Base URL" hint="Use the default for OpenAI, or point at any Chat Completions-compatible server. Must be https (http is allowed for localhost).">
                <TextSetting value={settings.openaiBaseUrl} onCommit={(v) => updateSettings({ openaiBaseUrl: v })} testId="base-url" width={280} />
              </Row>
              <Row title="Transcription model" hint="Used for microphone dictation in meetings.">
                <TextSetting value={settings.transcriptionModel} onCommit={(v) => updateSettings({ transcriptionModel: v })} width={200} />
              </Row>
            </>
          )}
          <Row title="Response style" hint="How much detail the assistant aims for by default.">
            <Segmented label="Response style" value={settings.responseStyle} onChange={(v) => void updateSettings({ responseStyle: v })} options={[{ value: 'concise', label: 'Concise' }, { value: 'balanced', label: 'Balanced' }, { value: 'detailed', label: 'Detailed' }]} />
          </Row>
          <Row title="Maximum reply length" hint="Upper limit in tokens for a single reply.">
            <TextSetting type="number" value={String(settings.maxTokens)} onCommit={(v) => updateSettings({ maxTokens: Number(v) })} width={110} testId="max-tokens" />
          </Row>
          <Row title="Temperature" hint="Leave on Auto to use the provider’s default (some models do not accept a custom value).">
            <div className="inline">
              <Segmented label="Temperature mode" value={settings.temperature === null ? 'auto' : 'custom'} onChange={(v) => void updateSettings({ temperature: v === 'auto' ? null : 0.7 })} options={[{ value: 'auto', label: 'Auto' }, { value: 'custom', label: 'Custom' }]} />
              {settings.temperature !== null && <TextSetting type="number" value={String(settings.temperature)} onCommit={(v) => updateSettings({ temperature: Number(v) })} width={80} />}
            </div>
          </Row>
          <Row title="Translate into" hint="Target language for the Translate quick action.">
            <TextSetting value={settings.translateLanguage} onCommit={(v) => updateSettings({ translateLanguage: v })} width={160} testId="translate-language" />
          </Row>
        </Section>

        <PrivacySection />

        <Section id="shortcuts" title="Keyboard shortcuts" description="Global shortcuts work while another application is focused. Click a shortcut, then press the new key combination.">
          {SHORTCUT_ACTIONS.map((a) => <ShortcutRow key={a} action={a} />)}
        </Section>

        <Section id="appearance" title="Appearance & window">
          <Row title="Theme">
            <Segmented label="Theme" value={settings.theme} onChange={(v) => void updateSettings({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]} />
          </Row>
          <Row title="Compact floating mode" hint="A small always-on-top window that sits beside your other apps.">
            <Toggle checked={settings.compact} onChange={(v) => void updateSettings({ compact: v })} label="Compact mode" />
          </Row>
          <Row title="Keep on top" hint="Keep the full window above other windows too.">
            <Toggle checked={settings.alwaysOnTop} onChange={(v) => void updateSettings({ alwaysOnTop: v })} label="Keep on top" />
          </Row>
          <Row title="Hide Undertone while capturing" hint="Move the assistant out of the way while you select a screen region.">
            <Toggle checked={settings.hideOnCapture} onChange={(v) => void updateSettings({ hideOnCapture: v })} label="Hide while capturing" />
          </Row>
        </Section>

        <Section id="startup" title="Startup">
          <Row title="Launch at login" hint={loginSupported ? 'Adds Undertone to your normal startup apps. You can also remove it there.' : 'Available in the installed app on Windows and macOS.'}>
            <Toggle checked={settings.launchAtLogin} disabled={!loginSupported} onChange={(v) => void updateSettings({ launchAtLogin: v })} label="Launch at login" />
          </Row>
          <Row title="Start in the tray" hint="When launched at login, stay hidden until you open it.">
            <Toggle checked={settings.startMinimized} disabled={!loginSupported} onChange={(v) => void updateSettings({ startMinimized: v })} label="Start in the tray" />
          </Row>
        </Section>

        <Section id="data" title="Data & storage" description="Conversations, meetings, context and settings are stored only on this device, as files in the folder below.">
          <Row stack title="Data folder" hint={<code className="path" data-testid="data-path">{info.dataPath}</code>}>
            <button type="button" className="btn" onClick={() => void api.openDataFolder()}><IconFolder size={14} /> Open folder</button>
          </Row>
          <Row title="Clear history" hint="Delete every conversation and meeting session. Settings and keys are kept.">
            <button type="button" className="btn danger" onClick={() => setConfirm('history')}><IconTrash size={14} /> Clear history</button>
          </Row>
          <Row title="Reset application data" hint="Delete history, context, saved API keys and settings, and return Undertone to its defaults.">
            <button type="button" className="btn danger" onClick={() => setConfirm('reset')} data-testid="reset-data">Reset everything</button>
          </Row>
        </Section>

        <Section id="about" title="About">
          <div className="about">
            <Logo size={44} />
            <div>
              <strong>Undertone <span className="muted">v{info.version}</span></strong>
              <p>A quiet desktop assistant for meetings, interviews, presentations and deep work.</p>
              <p className="muted small">Electron {info.electron} · Chromium {info.chrome} · {info.platform} {info.osRelease}</p>
              <p className="muted small">Open source under the MIT License. Undertone is an independent project and is not affiliated with any other assistant product.</p>
            </div>
          </div>
        </Section>
      </div>

      {confirm === 'history' && <ConfirmModal title="Clear all history?" body="Every conversation and meeting session stored on this device will be permanently deleted." confirmLabel="Delete everything" onConfirm={() => void clearAllHistory()} onClose={() => setConfirm(null)} />}
      {confirm === 'reset' && <ConfirmModal title="Reset Undertone?" body="This deletes all history, context, saved API keys and settings on this device. It cannot be undone." confirmLabel="Reset everything" onConfirm={() => void resetAllData()} onClose={() => setConfirm(null)} />}
    </section>
  );
}
