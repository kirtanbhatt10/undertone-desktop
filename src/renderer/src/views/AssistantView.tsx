import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatAccelerator } from '../../../shared/accelerator';
import { QUICK_ACTIONS } from '../../../shared/actions';
import { contextFieldCount, hasActiveContext } from '../../../shared/prompt';
import type { ChatMessage } from '../../../shared/types';
import { IconAlert, IconCrop, IconClose, IconImage, IconRefresh, IconSend, IconSpark, IconStop, IconTrash, Logo } from '../components/icons';
import { Markdown } from '../components/Markdown';
import { CopyButton, ConfirmModal } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { clock } from '../lib/format';
import { attachmentUrl, fileToAttachment } from '../lib/images';
import {
  addAttachment,
  clearConversation,
  navigate,
  regenerate,
  removeAttachment,
  runQuickAction,
  sendMessage,
  setDraft,
  stopStreaming,
  toast,
  toggleContext,
  useStore,
} from '../store';

const STARTERS = [
  { title: 'Prepare me', text: 'Using my context, give me the five things I should be ready to talk about and a one-line answer for each.' },
  { title: 'Explain simply', text: 'Explain the difference between a mutex and a semaphore, with a short example.' },
  { title: 'Draft a reply', text: 'Draft a polite reply declining a meeting and proposing two alternative times next week.' },
];

function splitQuickAction(content: string): { instruction: string; body: string } | null {
  const m = /^([^\n]+)\n\n"""\n([\s\S]*)\n"""$/.exec(content);
  return m ? { instruction: m[1] ?? '', body: m[2] ?? '' } : null;
}

function Message({ message, streaming, isLast }: { message: ChatMessage; streaming: boolean; isLast: boolean }) {
  if (message.role === 'user') {
    const quick = message.action ? splitQuickAction(message.content) : null;
    return (
      <div className="msg user" data-testid="msg-user">
        <div className="bubble">
          {message.action && <span className="action-chip"><IconSpark size={12} />{message.action}</span>}
          {message.attachments?.length ? (
            <div className="msg-images">
              {message.attachments.map((a) => (
                <img key={a.id} src={attachmentUrl(a)} alt={a.name ?? 'Attached image'} />
              ))}
            </div>
          ) : null}
          {(quick ? quick.body : message.content) && <p className={quick ? 'quoted' : ''}>{quick ? quick.body : message.content}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="msg assistant" data-testid="msg-assistant" data-streaming={streaming ? 'true' : 'false'}>
      <div className="avatar"><Logo size={22} /></div>
      <div className="msg-main">
        {message.content ? <Markdown source={message.content} /> : streaming ? <div className="thinking"><i /><i /><i /></div> : null}
        {streaming && message.content ? <span className="caret" /> : null}
        {message.error && (
          <div className="msg-error" data-testid="msg-error">
            <IconAlert size={15} />
            <span>{message.error}</span>
            <button type="button" className="link-btn" onClick={() => navigate('settings')}>Open settings</button>
          </div>
        )}
        {!streaming && (
          <div className="msg-tools">
            {message.content && <CopyButton text={message.content} />}
            {isLast && (
              <button type="button" className="ghost-btn" onClick={() => void regenerate()} data-testid="regenerate">
                <IconRefresh size={14} />
                Regenerate
              </button>
            )}
            <span className="msg-meta">{message.mock ? 'mock · ' : ''}{clock(message.createdAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Composer() {
  const draft = useStore((s) => s.draft);
  const attachments = useStore((s) => s.attachments);
  const streaming = useStore((s) => !!s.streaming);
  const focusTick = useStore((s) => s.focusTick);
  const captureAccel = useStore((s) => s.app?.settings.shortcuts.capture ?? '');
  const platform = useStore((s) => s.app?.info.platform ?? '');
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    ref.current?.focus();
  }, [focusTick]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  async function addFiles(files: Iterable<File>): Promise<void> {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      try {
        addAttachment(await fileToAttachment(file));
      } catch (err) {
        toast(errorMessage(err), 'error');
      }
    }
  }

  return (
    <div
      className={`composer${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(e.dataTransfer.files); }}
    >
      {attachments.length > 0 && (
        <div className="attachments" data-testid="attachments">
          {attachments.map((a) => (
            <div key={a.id} className="attachment">
              <img src={attachmentUrl(a)} alt={a.name ?? 'Attachment'} />
              <button type="button" title="Remove image" aria-label="Remove image" onClick={() => removeAttachment(a.id)}><IconClose size={11} /></button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        rows={1}
        value={draft}
        placeholder="Ask anything, or paste text and pick an action…"
        onChange={(e) => setDraft(e.target.value)}
        onPaste={(e) => {
          const files = [...e.clipboardData.files];
          if (files.some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            void addFiles(files);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void sendMessage(draft);
          }
        }}
        data-testid="composer"
      />
      <div className="composer-bar">
        <button type="button" className="tool-btn" title={`Capture a screen region (${formatAccelerator(captureAccel, platform)})`} onClick={() => void api.startCapture()} data-testid="capture">
          <IconCrop size={15} /> <span>Capture</span>
        </button>
        <button type="button" className="tool-btn" title="Attach an image" onClick={() => fileRef.current?.click()} data-testid="attach">
          <IconImage size={15} /> <span>Image</span>
        </button>
        <input ref={fileRef} type="file" hidden multiple accept="image/png,image/jpeg,image/webp,image/gif" data-testid="file-input" onChange={(e) => { void addFiles(e.target.files ?? []); e.target.value = ''; }} />
        <span className="composer-hint">Enter to send · Shift+Enter for a new line</span>
        {streaming ? (
          <button type="button" className="send stop" onClick={stopStreaming} title="Stop generating" aria-label="Stop generating" data-testid="stop"><IconStop size={15} /></button>
        ) : (
          <button type="button" className="send" onClick={() => void sendMessage(draft)} disabled={!draft.trim() && attachments.length === 0} title="Send" aria-label="Send" data-testid="send"><IconSend size={16} /></button>
        )}
      </div>
    </div>
  );
}

export function AssistantView() {
  const conversation = useStore((s) => s.conversation);
  const streaming = useStore((s) => s.streaming);
  const app = useStore((s) => s.app);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [conversation.messages, streaming]);

  useEffect(() => {
    stick.current = true;
  }, [conversation.id]);

  if (!app) return null;
  const empty = conversation.messages.length === 0;
  const lastId = conversation.messages[conversation.messages.length - 1]?.id;
  const ctxActive = hasActiveContext(app.context);
  const fallback = app.effectiveProvider === 'mock' && app.settings.provider !== 'mock';

  return (
    <section className="view assistant-view">
      <header className="view-head">
        <div className="view-title">
          <h1 data-testid="conversation-title">{empty ? 'Assistant' : conversation.title}</h1>
          <button type="button" className={`context-chip${ctxActive ? ' active' : ''}`} onClick={() => toggleContext()} title="Open the context panel" data-testid="context-chip">
            <i />
            {ctxActive ? `Context · ${contextFieldCount(app.context)}` : app.context.enabled ? 'No context' : 'Context paused'}
          </button>
        </div>
        {!empty && (
          <button type="button" className="ghost-btn" onClick={() => setConfirmClear(true)} data-testid="clear-conversation">
            <IconTrash size={14} /> Clear
          </button>
        )}
      </header>

      {fallback && (
        <div className="banner" data-testid="mock-banner">
          <IconAlert size={15} />
          <span><strong>Mock mode.</strong> No API key is configured for {app.settings.provider === 'anthropic' ? 'Anthropic' : 'OpenAI'}, so replies are simulated.</span>
          <button type="button" className="link-btn" onClick={() => navigate('settings')}>Add a key</button>
        </div>
      )}

      <div className="messages" ref={scroller} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} data-testid="messages">
        {empty ? (
          <div className="empty">
            <Logo size={52} />
            <h2>What do you need right now?</h2>
            <p>Undertone stays beside whatever you’re working in. Add context on the right and it shapes every answer.</p>
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s.title} type="button" onClick={() => setDraft(s.text)}>
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="thread">
            {conversation.messages.map((m) => (
              <Message key={m.id} message={m} streaming={streaming?.messageId === m.id} isLast={m.id === lastId} />
            ))}
          </div>
        )}
      </div>

      <div className="dock">
        <div className="quick-actions" data-testid="quick-actions">
          {QUICK_ACTIONS.map((a) => (
            <button key={a.id} type="button" disabled={!!streaming} onClick={() => void runQuickAction(a)} data-testid={`qa-${a.id}`}>
              {a.label}
            </button>
          ))}
        </div>
        <Composer />
      </div>

      {confirmClear && <ConfirmModal title="Clear this conversation?" body="The conversation and its messages will be deleted from this device." confirmLabel="Clear conversation" onConfirm={() => void clearConversation()} onClose={() => setConfirmClear(false)} />}
    </section>
  );
}
