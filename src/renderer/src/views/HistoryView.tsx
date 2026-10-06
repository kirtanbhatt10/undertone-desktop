import { useMemo, useState } from 'react';
import { IconChat, IconMeeting, IconSearch, IconTrash } from '../components/icons';
import { ConfirmModal, Segmented } from '../components/ui';
import { dateTime, dayBucket, duration } from '../lib/format';
import { clearAllHistory, deleteConversation, deleteMeeting, openConversation, openMeeting, useStore } from '../store';

interface Row {
  id: string;
  kind: 'chat' | 'meeting';
  title: string;
  ts: number;
  preview: string;
  meta: string;
}

export function HistoryView() {
  const conversations = useStore((s) => s.conversations);
  const meetings = useStore((s) => s.meetings);
  const [filter, setFilter] = useState<'all' | 'chat' | 'meeting'>('all');
  const [query, setQuery] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const rows = useMemo(() => {
    const all: Row[] = [
      ...conversations.map((c): Row => ({ id: c.id, kind: 'chat', title: c.title, ts: c.updatedAt, preview: c.preview, meta: `${c.messageCount} message${c.messageCount === 1 ? '' : 's'}` })),
      ...meetings.map((m): Row => ({ id: m.id, kind: 'meeting', title: m.title, ts: m.startedAt, preview: m.preview, meta: m.endedAt ? `Meeting · ${duration(m.endedAt - m.startedAt)}` : 'Meeting · in progress' })),
    ];
    const q = query.trim().toLowerCase();
    return all
      .filter((r) => (filter === 'all' || r.kind === filter) && (!q || r.title.toLowerCase().includes(q) || r.preview.toLowerCase().includes(q)))
      .sort((a, b) => b.ts - a.ts);
  }, [conversations, meetings, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = dayBucket(r.ts);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()];
  }, [rows]);

  const total = conversations.length + meetings.length;

  return (
    <section className="view history-view">
      <header className="view-head">
        <div className="view-title">
          <h1>History</h1>
          <span className="muted small">{total} item{total === 1 ? '' : 's'} stored on this device</span>
        </div>
        <button type="button" className="btn danger" disabled={total === 0} onClick={() => setConfirmAll(true)} data-testid="clear-history">
          <IconTrash size={14} /> Clear all history
        </button>
      </header>

      <div className="history-tools">
        <label className="search">
          <IconSearch size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search titles and previews" data-testid="history-search" />
        </label>
        <Segmented label="Filter" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'chat', label: 'Conversations' }, { value: 'meeting', label: 'Meetings' }]} />
      </div>

      <div className="history-list" data-testid="history-list">
        {rows.length === 0 && (
          <div className="empty small">
            <h2>{total === 0 ? 'Nothing here yet' : 'No matches'}</h2>
            <p>{total === 0 ? 'Conversations and meeting sessions are saved locally and listed here.' : 'Try a different search or filter.'}</p>
          </div>
        )}
        {groups.map(([label, items]) => (
          <div key={label} className="history-group">
            <div className="side-label">{label}</div>
            {items.map((r) => (
              <div key={`${r.kind}-${r.id}`} className="history-row" data-testid="history-row" data-kind={r.kind}>
                <button type="button" className="history-open" onClick={() => void (r.kind === 'chat' ? openConversation(r.id) : openMeeting(r.id))}>
                  <span className={`history-icon ${r.kind}`}>{r.kind === 'chat' ? <IconChat size={15} /> : <IconMeeting size={15} />}</span>
                  <span className="history-text">
                    <strong>{r.title}</strong>
                    <em>{r.preview || 'No content'}</em>
                  </span>
                  <span className="history-meta">
                    <span>{dateTime(r.ts)}</span>
                    <span>{r.meta}</span>
                  </span>
                </button>
                <button type="button" className="icon-btn danger" title="Delete" aria-label={`Delete ${r.title}`} onClick={() => setPendingDelete(r)} data-testid="history-delete">
                  <IconTrash size={15} />
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title={pendingDelete.kind === 'chat' ? 'Delete conversation?' : 'Delete meeting session?'}
          body={`“${pendingDelete.title}” will be permanently removed from this device.`}
          confirmLabel="Delete"
          onConfirm={() => void (pendingDelete.kind === 'chat' ? deleteConversation(pendingDelete.id) : deleteMeeting(pendingDelete.id))}
          onClose={() => setPendingDelete(null)}
        />
      )}
      {confirmAll && <ConfirmModal title="Clear all history?" body="Every conversation and meeting session stored on this device will be permanently deleted. Settings and API keys are kept." confirmLabel="Delete everything" onConfirm={() => void clearAllHistory()} onClose={() => setConfirmAll(false)} />}
    </section>
  );
}
