import type { ViewId } from '../../../shared/types';
import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { navigate, newConversation, openConversation, useStore } from '../store';
import { IconChat, IconHistory, IconMeeting, IconPlus, IconPower, IconSettings } from './icons';

const NAV: Array<{ view: ViewId; label: string; icon: typeof IconChat }> = [
  { view: 'assistant', label: 'Assistant', icon: IconChat },
  { view: 'meeting', label: 'Meeting', icon: IconMeeting },
  { view: 'history', label: 'History', icon: IconHistory },
  { view: 'settings', label: 'Settings', icon: IconSettings },
];

const PROVIDER_LABEL = { anthropic: 'Anthropic', openai: 'OpenAI', mock: 'Mock mode' } as const;

export function Sidebar() {
  const view = useStore((s) => s.view);
  const conversations = useStore((s) => s.conversations);
  const currentId = useStore((s) => s.conversation.id);
  const app = useStore((s) => s.app);
  const meetingLive = useStore((s) => !!s.meeting && s.meeting.endedAt === null);
  if (!app) return null;
  const effective = app.effectiveProvider;
  const fallback = effective === 'mock' && app.settings.provider !== 'mock';

  return (
    <aside className="sidebar">
      <button type="button" className="new-chat" onClick={newConversation} data-testid="new-chat">
        <IconPlus size={15} />
        New conversation
      </button>

      <nav className="side-nav" aria-label="Main">
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <button key={v} type="button" className={view === v ? 'active' : ''} onClick={() => navigate(v)} data-testid={`nav-${v}`}>
            <Icon size={16} />
            <span>{label}</span>
            {v === 'meeting' && meetingLive && <i className="live-dot" title="Meeting in progress" />}
          </button>
        ))}
      </nav>

      <div className="side-section">
        <div className="side-label">Recent</div>
        <div className="side-list" data-testid="recent-list">
          {conversations.length === 0 && <p className="side-empty">Conversations you have will appear here.</p>}
          {conversations.slice(0, 30).map((c) => (
            <button key={c.id} type="button" className={`side-item${c.id === currentId && view === 'assistant' ? ' active' : ''}`} onClick={() => void openConversation(c.id)} title={c.title}>
              <span className="side-item-title">{c.title}</span>
              <span className="side-item-time">{relativeTime(c.updatedAt)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="side-footer">
        <button type="button" className={`provider-chip${fallback ? ' warn' : ''}`} onClick={() => navigate('settings')} title={fallback ? 'No API key configured — replies are simulated. Click to add a key.' : 'Change provider or model'} data-testid="provider-chip">
          <i className={`status-dot ${effective === 'mock' ? 'mock' : 'live'}`} />
          <span className="provider-chip-text">
            <strong>{PROVIDER_LABEL[effective]}</strong>
            <em>{fallback ? 'Add an API key' : app.settings.models[effective]}</em>
          </span>
        </button>
        <button type="button" className="icon-btn" title="Quit Undertone" aria-label="Quit Undertone" onClick={() => void api.quit()}>
          <IconPower size={15} />
        </button>
      </div>
    </aside>
  );
}
