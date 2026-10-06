import { useEffect } from 'react';
import { ContextPanel } from './components/ContextPanel';
import { Sidebar } from './components/Sidebar';
import { TitleBar } from './components/TitleBar';
import { IconAlert, IconCheck, IconClose } from './components/icons';
import { dismissToast, newConversation, toggleContext, useStore } from './store';
import { AssistantView } from './views/AssistantView';
import { HistoryView } from './views/HistoryView';
import { MeetingView } from './views/MeetingView';
import { SettingsView } from './views/SettingsView';

function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.level}`} data-testid="toast">
          {t.level === 'info' ? <IconCheck size={14} /> : <IconAlert size={14} />}
          <span>{t.message}</span>
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><IconClose size={12} /></button>
        </div>
      ))}
    </div>
  );
}

export function App() {
  const ready = useStore((s) => !!s.app);
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.app?.settings.theme ?? 'dark');
  const compact = useStore((s) => s.app?.settings.compact ?? false);
  const contextOpen = useStore((s) => s.contextOpen);
  const privacyOn = useStore((s) => s.app?.privacy.enabled ?? false);
  const probe = useStore((s) => s.probe);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = (): void => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  // In-app shortcuts (global ones are registered by the main process).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.altKey && !e.shiftKey && e.code === 'KeyN') {
        e.preventDefault();
        newConversation();
      } else if (mod && !e.altKey && !e.shiftKey && e.code === 'Period') {
        e.preventDefault();
        toggleContext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ready) return <div className="boot" />;

  return (
    <div className={`app${compact ? ' compact' : ''}${contextOpen ? ' context-open' : ''}${privacyOn ? ' privacy-on' : ''}`} data-testid="app" data-view={view}>
      <TitleBar />
      <div className="body">
        <Sidebar />
        <main className="main">
          {view === 'assistant' && <AssistantView />}
          {view === 'meeting' && <MeetingView />}
          {view === 'history' && <HistoryView />}
          {view === 'settings' && <SettingsView />}
        </main>
        {contextOpen && <ContextPanel />}
      </div>
      <Toasts />
      {probe && <div className="privacy-probe" data-testid="privacy-probe" />}
    </div>
  );
}
