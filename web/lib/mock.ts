export const REPO = 'https://github.com/kirtanbhatt10/undertone-desktop';
export const RELEASES = `${REPO}/releases/latest`;

export const QUICK_ACTIONS = [
  { id: 'summarize', label: 'Summarize' },
  { id: 'explain', label: 'Explain' },
  { id: 'rewrite', label: 'Rewrite professionally' },
  { id: 'answer', label: 'Generate answer' },
  { id: 'brainstorm', label: 'Brainstorm' },
  { id: 'actions', label: 'Extract action items' },
  { id: 'translate', label: 'Translate' },
  { id: 'concise', label: 'Make concise' },
  { id: 'expand', label: 'Expand' },
  { id: 'followup', label: 'Generate follow-up' },
] as const;

export const MEETING_TOOLS = [
  { kind: 'summary', label: 'Summary', blurb: 'What happened, in brief' },
  { kind: 'actionItems', label: 'Action items', blurb: 'Who does what, by when' },
  { kind: 'decisions', label: 'Decisions', blurb: 'What was agreed' },
  { kind: 'followUps', label: 'Follow-ups', blurb: 'Points to raise afterwards' },
  { kind: 'questions', label: 'Questions to ask', blurb: 'Sharpen the conversation' },
] as const;

export type MeetingKind = (typeof MEETING_TOOLS)[number]['kind'];

export interface Context {
  topic: string;
  role: string;
  notes: string;
}

export interface TranscriptLine {
  at: number;
  speaker: string;
  text: string;
}

export const SAMPLE_TRANSCRIPT: TranscriptLine[] = [
  { at: 12, speaker: 'Maya', text: 'Quick recap: the onboarding redesign shipped to 20% of new users on Monday.' },
  { at: 41, speaker: 'Dev', text: 'Activation is up four points in that group, but support tickets about billing doubled.' },
  { at: 77, speaker: 'Maya', text: 'Then we hold the rollout at 20% until billing copy is fixed. Priya, can you own that?' },
  { at: 95, speaker: 'Priya', text: 'Yes, I can have new copy reviewed by Thursday.' },
  { at: 130, speaker: 'Dev', text: 'I will add a dashboard for ticket volume by onboarding variant.' },
  { at: 162, speaker: 'Maya', text: 'Open question: do we tell sales about the new trial length yet?' },
];

const ACTION_REPLIES: Record<string, string> = {
  summarize:
    '**Takeaway:** the redesign is working, but billing copy is costing you support time.\n\n- Activation up four points in the test group\n- Billing tickets doubled in the same group\n- Rollout holds at 20% until the copy is fixed',
  explain:
    'Think of **activation** as the moment a new user gets real value for the first time, like sending their first invoice.\n\nIf more people reach that moment sooner, the onboarding is doing its job. The ticket spike tells you *where* they still get stuck.',
  rewrite:
    'Thanks for flagging this. We are pausing the rollout at 20% while we tighten the billing copy, and we will share an update on Thursday.',
  answer:
    'The short answer is yes, it is working: activation rose four points. The cost is a jump in billing questions, so we are holding the rollout until that copy is fixed, which should take until Thursday.',
  brainstorm:
    '1. Inline price preview on the plan step\n2. One-line "you will not be charged today" note\n3. Billing FAQ drawer inside onboarding\n4. Delay the card form until day three\n5. Short video on how invoices work\n6. Chat prompt when users hover the price\n7. Plain-language plan comparison\n8. Email recap of what they signed up for',
  actions:
    '- [ ] Rewrite billing copy, reviewed: **Priya**, Thursday\n- [ ] Ticket-volume dashboard by variant: **Dev**, no date\n- [ ] Decide whether to brief sales on trial length: unassigned',
  translate:
    'Gracias por avisar. Pausamos el despliegue en el 20% mientras mejoramos el texto de facturación; compartiremos novedades el jueves.',
  concise: 'Rollout paused at 20% until billing copy is fixed (Thursday).',
  expand:
    'The redesign shipped to one in five new users on Monday. In that group activation rose four points, a strong early signal. At the same time, billing-related tickets doubled, which suggests the new flow surfaces pricing before people understand it.\n\nFor example, users now meet the card form on the second screen instead of the fifth.',
  followup:
    'Hi all, thanks for today. Next steps:\n\n- Priya: billing copy reviewed by Thursday\n- Dev: ticket dashboard by variant\n- Maya: decide on briefing sales\n\nWe will revisit the rollout once the copy is live.',
};

const MEETING_REPLIES: Record<MeetingKind, string> = {
  summary:
    '**Onboarding redesign: good activation, billing confusion.**\n\n- Shipped to 20% of new users on Monday\n- Activation up four points\n- Billing tickets doubled\n- Rollout held at 20% until copy is fixed',
  actionItems:
    '- [ ] New billing copy, reviewed — Priya — Thursday\n- [ ] Ticket volume dashboard by variant — Dev — no date\n- [ ] Decide on sales briefing — unassigned — no date',
  decisions:
    '- **Hold rollout at 20%.** Billing tickets doubled in the test group.\n\nStill open:\n- Whether to tell sales about the new trial length',
  followUps:
    '- Confirm Thursday review slot for billing copy\n- Share the ticket dashboard link when ready\n- Ask sales lead whether a trial-length change affects Q4 deals',
  questions:
    '1. Which billing question appears most in the new tickets?\n2. Did activation rise for all plans or mainly the free tier?\n3. What ticket volume would let us go to 50%?\n4. Who signs off on the new copy?\n5. When does sales need to know about trial length?',
};

export function replyForAction(id: string): string {
  return ACTION_REPLIES[id] ?? ACTION_REPLIES.summarize;
}

export function replyForMeeting(kind: MeetingKind): string {
  return MEETING_REPLIES[kind];
}

export function replyForPrompt(prompt: string, ctx: Context, useContext: boolean): string {
  const p = prompt.toLowerCase();
  const lead =
    useContext && ctx.topic.trim()
      ? `With **${ctx.topic.trim()}** in mind${ctx.role.trim() ? `, speaking as ${ctx.role.trim()}` : ''}:\n\n`
      : '';
  if (/(question|ask|interview)/.test(p)) {
    return `${lead}- What does success look like ninety days from now?\n- Which trade-off are you least comfortable with?\n- What would make you change this plan?`;
  }
  if (/(email|message|reply|follow)/.test(p)) {
    return `${lead}${ACTION_REPLIES.followup}`;
  }
  if (/(summar|recap|tl;?dr)/.test(p)) {
    return `${lead}${ACTION_REPLIES.summarize}`;
  }
  return `${lead}Here is a direct answer you could say out loud:\n\n> ${prompt.trim().replace(/\?$/, '')}: the honest answer is that it depends on the trade-off you care about most. Name it first, then give one number that supports it.\n\nThis is a simulated reply. Connect a provider in the desktop app for real answers.`;
}

/** Streams `text` into `onChunk` a few characters at a time. Returns a cancel function. */
export function streamText(text: string, onChunk: (soFar: string) => void, onDone?: () => void, speed = 14): () => void {
  let i = 0;
  const id = window.setInterval(() => {
    i = Math.min(text.length, i + 3);
    onChunk(text.slice(0, i));
    if (i >= text.length) {
      window.clearInterval(id);
      onDone?.();
    }
  }, speed);
  return () => window.clearInterval(id);
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
