import { useRef, useState } from 'react';
import { EMPTY_CONTEXT, LIMITS } from '../../../shared/defaults';
import { contextFieldCount } from '../../../shared/prompt';
import type { ContextData } from '../../../shared/types';
import { setContext, toast, toggleContext, useStore } from '../store';
import { IconClose, IconFolder } from './icons';
import { ConfirmModal, IconButton, Toggle } from './ui';

type Field = Exclude<keyof ContextData, 'enabled'>;

const FIELDS: Array<{ key: Field; label: string; placeholder: string; rows: number; multiline: boolean }> = [
  { key: 'topic', label: 'Topic', placeholder: 'e.g. Q3 roadmap review with the platform team', rows: 1, multiline: false },
  { key: 'role', label: 'Role', placeholder: 'e.g. Interviewing for Senior Backend Engineer', rows: 1, multiline: false },
  { key: 'questions', label: 'Questions', placeholder: 'Questions you expect, or want answered', rows: 3, multiline: true },
  { key: 'notes', label: 'Notes', placeholder: 'Talking points, facts, reminders', rows: 3, multiline: true },
  { key: 'documents', label: 'Documents & text', placeholder: 'Paste a résumé, job description, spec, agenda… or load a text file', rows: 5, multiline: true },
  { key: 'instructions', label: 'Custom instructions', placeholder: 'e.g. Answer in British English. Keep answers under 80 words.', rows: 3, multiline: true },
];

const TEXT_TYPES = /\.(txt|md|markdown|csv|json|log|yaml|yml|xml|html?|ts|tsx|js|jsx|py|java|go|rs|c|cpp|cs|sql|sh)$/i;

export function ContextPanel() {
  const context = useStore((s) => s.app?.context);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  if (!context) return null;
  const filled = contextFieldCount(context);

  async function loadFile(file: File | undefined): Promise<void> {
    if (!file || !context) return;
    if (!TEXT_TYPES.test(file.name) && !file.type.startsWith('text/')) return toast('Only plain-text files can be loaded here. Paste the text from PDFs or Word documents.', 'warn');
    if (file.size > 1_000_000) return toast('That file is larger than 1 MB.', 'warn');
    const text = await file.text();
    const joined = `${context.documents.trim() ? `${context.documents.trim()}\n\n` : ''}--- ${file.name} ---\n${text}`;
    if (joined.length > LIMITS.documentChars) return toast('There is not enough room left in Documents for that file.', 'warn');
    setContext({ documents: joined });
    toast(`Added ${file.name} to context`);
  }

  return (
    <aside className="context-panel" data-testid="context-panel">
      <header className="panel-head">
        <div>
          <h2>Context</h2>
          <p>{context.enabled ? (filled ? `${filled} field${filled === 1 ? '' : 's'} shared with the assistant` : 'Nothing shared yet') : 'Paused — not sent to the assistant'}</p>
        </div>
        <Toggle checked={context.enabled} onChange={(enabled) => setContext({ enabled })} label="Use context" />
        <span className="panel-close">
          <IconButton title="Close context panel" onClick={() => toggleContext(false)}>
            <IconClose size={15} />
          </IconButton>
        </span>
      </header>

      <div className={`panel-body${context.enabled ? '' : ' paused'}`}>
        {FIELDS.map((f) => (
          <label key={f.key} className="field">
            <span className="field-label">
              {f.label}
              {f.key === 'documents' && (
                <button type="button" className="link-btn" onClick={() => fileRef.current?.click()}>
                  <IconFolder size={12} /> Load text file
                </button>
              )}
            </span>
            {f.multiline ? (
              <textarea
                rows={f.rows}
                value={context[f.key]}
                placeholder={f.placeholder}
                maxLength={f.key === 'documents' ? LIMITS.documentChars : LIMITS.contextFieldChars}
                onChange={(e) => setContext({ [f.key]: e.target.value })}
                data-testid={`ctx-${f.key}`}
                spellCheck={f.key !== 'documents'}
              />
            ) : (
              <input type="text" value={context[f.key]} placeholder={f.placeholder} maxLength={300} onChange={(e) => setContext({ [f.key]: e.target.value })} data-testid={`ctx-${f.key}`} />
            )}
          </label>
        ))}
        <input ref={fileRef} type="file" hidden accept=".txt,.md,.markdown,.csv,.json,.log,.yaml,.yml,text/*" onChange={(e) => { void loadFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>

      <footer className="panel-foot">
        <span>Stored only on this device.</span>
        <button type="button" className="link-btn" disabled={!filled} onClick={() => setConfirmClear(true)}>
          Clear context
        </button>
      </footer>

      {confirmClear && (
        <ConfirmModal
          title="Clear context?"
          body="This empties every context field. It cannot be undone."
          confirmLabel="Clear context"
          onConfirm={() => setContext({ ...EMPTY_CONTEXT, enabled: context.enabled })}
          onClose={() => setConfirmClear(false)}
        />
      )}
    </aside>
  );
}
