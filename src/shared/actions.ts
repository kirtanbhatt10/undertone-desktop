import type { MeetingOutputKind } from './types';

export interface QuickAction {
  id: string;
  label: string;
  /** Instruction placed before the user's text. */
  instruction: (opts: { language: string }) => string;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { id: 'summarize', label: 'Summarize', instruction: () => 'Summarize the following in a few tight bullet points. Lead with the single most important takeaway.' },
  { id: 'explain', label: 'Explain', instruction: () => 'Explain the following clearly, as you would to a smart colleague who is new to the topic. Define any jargon.' },
  { id: 'rewrite', label: 'Rewrite professionally', instruction: () => 'Rewrite the following so it reads as polished, professional and courteous. Keep the meaning and roughly the same length. Return only the rewritten text.' },
  { id: 'answer', label: 'Generate answer', instruction: () => 'Write a strong, direct answer to the following question or prompt that I could say out loud. Use the shared context where relevant.' },
  { id: 'brainstorm', label: 'Brainstorm', instruction: () => 'Brainstorm eight distinct, concrete ideas in response to the following. One line each, most promising first.' },
  { id: 'actions', label: 'Extract action items', instruction: () => 'Extract every action item from the following as a checklist. Include an owner and a due date whenever they are stated; write "unassigned" otherwise. Do not invent items.' },
  { id: 'translate', label: 'Translate', instruction: ({ language }) => `Translate the following into ${language}. Preserve tone and formatting. Return only the translation.` },
  { id: 'concise', label: 'Make concise', instruction: () => 'Rewrite the following to be as concise as possible without losing meaning. Return only the rewritten text.' },
  { id: 'expand', label: 'Expand', instruction: () => 'Expand the following with more detail, supporting points and a concrete example, keeping the original voice.' },
  { id: 'followup', label: 'Generate follow-up', instruction: () => 'Write a short, friendly follow-up message based on the following, with clear next steps.' },
];

export function buildQuickActionPrompt(action: QuickAction, text: string, language: string): string {
  return `${action.instruction({ language })}\n\n"""\n${text.trim()}\n"""`;
}

export interface MeetingTool {
  kind: MeetingOutputKind;
  label: string;
  blurb: string;
  instruction: string;
}

export const MEETING_TOOLS: readonly MeetingTool[] = [
  { kind: 'summary', label: 'Summary', blurb: 'What happened, in brief', instruction: 'Summarize this meeting so far: a one-sentence headline, then 3–6 bullets covering the key points discussed.' },
  { kind: 'actionItems', label: 'Action items', blurb: 'Who does what, by when', instruction: 'List every action item from this meeting as a markdown checklist ("- [ ] task — owner — due"). Use "unassigned" or "no date" when not stated. Do not invent items; if there are none, say so.' },
  { kind: 'decisions', label: 'Decisions', blurb: 'What was agreed', instruction: 'List the decisions that were actually made in this meeting, each with a one-line rationale if one was given. Separately list anything left open or unresolved.' },
  { kind: 'followUps', label: 'Follow-ups', blurb: 'Points to raise afterwards', instruction: 'Suggest the follow-up points I should send or raise after this meeting, as short bullets I could paste into a message.' },
  { kind: 'questions', label: 'Questions to ask', blurb: 'Sharpen the conversation', instruction: 'Suggest five sharp, specific questions I could ask right now to move this meeting forward or clear up ambiguity. Most valuable first.' },
];

export const MEETING_ANSWER_INSTRUCTION =
  'Answer the question below concisely (at most four sentences or five short bullets) using the meeting transcript, notes and shared context. If the meeting material does not contain the answer, say so briefly and then give your best general answer.';
