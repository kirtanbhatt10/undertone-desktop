import { formatAccelerator } from '../../../shared/accelerator';
import type { ViewId } from '../../../shared/types';
import { api } from '../lib/api';
import { navigate, setPrivacy, toggleContext, updateSettings, useStore } from '../store';
import { IconChat, IconClose, IconExpand, IconEyeOff, IconHistory, IconMeeting, IconMinus, IconPanel, IconPin, IconSettings, IconShield, IconShrink, Logo } from './icons';
import { IconButton } from './ui';

const NAV: Array<{ view: ViewId; label: string; icon: typeof IconChat }> = [
  { view: 'assistant', label: 'Assistant', icon: IconChat },
  { view: 'meeting', label: 'Meeting', icon: IconMeeting },
  { view: 'history', label: 'History', icon: IconHistory },
  { view: 'settings', label: 'Settings', icon: IconSettings },
];

export function PrivacyPill() {
  const privacy = useStore((s) => s.app?.privacy);
  const accel = useStore((s) => s.app?.settings.shortcuts.togglePrivacy ?? '');
  const platform = useStore((s) => s.app?.info.platform ?? '');
  if (!privacy) return null;
  const { enabled, capability } = privacy;
  const state = !enabled ? 'off' : capability.level === 'full' ? 'on' : capability.level === 'partial' ? 'partial' : 'unsupported';
  const label = { off: 'Visible to capture', on: 'Privacy on', partial: 'Privacy · partial', unsupported: 'Privacy · unsupported' }[state];
  const tip = {
    off: 'Privacy Mode is off. This window can appear in screenshots and screen sharing.',
    on: 'Privacy Mode is on. This window is excluded from supported screen-capture APIs.',
    partial: `Privacy Mode is on, but protection is partial on this system. ${capability.detail}`,
    unsupported: 'Privacy Mode is on, but this operating system cannot hide the window from capture.',
  }[state];
  return (
    <button type="button" className={`privacy-pill ${state}`} title={`${tip}\n${formatAccelerator(accel, platform)} to toggle`} onClick={() => void setPrivacy(!enabled)} data-testid="privacy-pill" data-state={state}>
      {enabled ? <IconEyeOff size={13} /> : <IconShield size={13} />}
      <span>{label}</span>
    </button>
  );
}

export function TitleBar() {
  const compact = useStore((s) => s.app?.settings.compact ?? false);
  const pinned = useStore((s) => s.app?.settings.alwaysOnTop ?? false);
  const view = useStore((s) => s.view);
  const contextOpen = useStore((s) => s.contextOpen);
  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <Logo size={20} />
        <span className="wordmark">Undertone</span>
      </div>
      <nav className="titlebar-nav" aria-label="Views">
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <button key={v} type="button" className={view === v ? 'active' : ''} title={label} aria-label={label} onClick={() => navigate(v)} data-testid={`tab-${v}`}>
            <Icon size={15} />
          </button>
        ))}
      </nav>
      <div className="titlebar-drag" />
      <div className="titlebar-actions">
        <PrivacyPill />
        <IconButton title={contextOpen ? 'Hide context panel' : 'Show context panel'} onClick={() => toggleContext()} active={contextOpen} testId="toggle-context">
          <IconPanel size={15} />
        </IconButton>
        {!compact && (
          <IconButton title={pinned ? 'Unpin from top' : 'Keep on top of other windows'} onClick={() => void updateSettings({ alwaysOnTop: !pinned })} active={pinned}>
            <IconPin size={15} />
          </IconButton>
        )}
        <IconButton title={compact ? 'Expand to full window' : 'Compact floating mode'} onClick={() => void updateSettings({ compact: !compact })} testId="toggle-compact">
          {compact ? <IconExpand size={14} /> : <IconShrink size={14} />}
        </IconButton>
        <span className="titlebar-sep" />
        <IconButton title="Minimize" onClick={() => void api.minimize()}>
          <IconMinus size={15} />
        </IconButton>
        <IconButton title="Hide to tray" onClick={() => void api.hide()} danger>
          <IconClose size={15} />
        </IconButton>
      </div>
    </header>
  );
}
