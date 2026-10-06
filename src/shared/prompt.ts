import type { ContextData, ResponseStyle } from './types';

const STYLE: Record<ResponseStyle, string> = {
  concise: 'Be brief: answer in a few sentences or short bullets unless asked for more.',
  balanced: 'Be direct and well organised. Prefer short paragraphs and bullets; add detail only where it helps.',
  detailed: 'Be thorough: explain reasoning, cover edge cases and give examples where useful.',
};

const CONTEXT_FIELDS: Array<{ key: Exclude<keyof ContextData, 'enabled'>; title: string }> = [
  { key: 'topic', title: 'Meeting / session topic' },
  { key: 'role', title: 'Role or position in focus' },
  { key: 'questions', title: 'Questions the user expects or wants covered' },
  { key: 'notes', title: 'User notes' },
  { key: 'documents', title: 'Reference documents and text' },
  { key: 'instructions', title: 'Custom instructions from the user' },
];

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}\n…[truncated]` : t;
}

/** True when at least one context field has content and context is switched on. */
export function hasActiveContext(context: ContextData): boolean {
  return context.enabled && CONTEXT_FIELDS.some((f) => context[f.key].trim().length > 0);
}

export function contextFieldCount(context: ContextData): number {
  return CONTEXT_FIELDS.filter((f) => context[f.key].trim().length > 0).length;
}

export function renderContext(context: ContextData): string {
  if (!hasActiveContext(context)) return '';
  const parts = CONTEXT_FIELDS.filter((f) => context[f.key].trim()).map(
    (f) => `<${f.key} title="${f.title}">\n${clip(context[f.key], 60_000)}\n</${f.key}>`,
  );
  return `<user_context>\n${parts.join('\n')}\n</user_context>`;
}

export interface SystemPromptInput {
  context: ContextData;
  style: ResponseStyle;
  mode?: 'chat' | 'meeting';
  meeting?: { title: string; transcript: string; notes: string };
  now?: Date;
}

export function buildSystemPrompt(input: SystemPromptInput): string {
  const now = input.now ?? new Date();
  const lines: string[] = [
    'You are Undertone, a desktop assistant that sits beside the user while they work: in meetings, interviews, presentations, coding sessions and everyday tasks.',
    'Give answers the user can act on immediately. Use Markdown. Put code in fenced blocks with a language tag.',
    STYLE[input.style],
    'If something is uncertain or missing from the material you were given, say so rather than guessing.',
    `Current date: ${now.toISOString().slice(0, 10)}.`,
  ];

  const ctx = renderContext(input.context);
  if (ctx) {
    lines.push(
      '',
      'The user has provided the context below. Treat it as background information and preferences from the user, and use it whenever it is relevant.',
      ctx,
    );
  }

  if (input.mode === 'meeting' && input.meeting) {
    const { title, transcript, notes } = input.meeting;
    lines.push(
      '',
      'A meeting session is in progress. The transcript is user-provided and may be partial or informal. Base meeting-related output strictly on it and on the notes; never invent attendees, commitments or dates.',
      `<meeting title="${title.replace(/"/g, "'")}">`,
      `<transcript>\n${clip(transcript, 300_000) || '(empty so far)'}\n</transcript>`,
      `<notes>\n${clip(notes, 60_000) || '(none)'}\n</notes>`,
      '</meeting>',
    );
  }
  return lines.join('\n');
}

export function titleFromText(text: string, fallback = 'New conversation'): string {
  const firstLine = text.replace(/"""[\s\S]*$/, '').trim().split('\n')[0]?.trim() ?? '';
  const clean = (firstLine || text.trim().split('\n')[0] || '').replace(/[#*_`>]/g, '').trim();
  if (!clean) return fallback;
  return clean.length > 56 ? `${clean.slice(0, 55).trimEnd()}…` : clean;
}
