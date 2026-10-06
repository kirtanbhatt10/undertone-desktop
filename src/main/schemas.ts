import { z } from 'zod';
import { LIMITS } from '../shared/defaults';
import { validateAccelerator } from '../shared/accelerator';

export const idSchema = z.string().uuid();
export const providerSchema = z.enum(['anthropic', 'openai', 'mock']);
export const realProviderSchema = z.enum(['anthropic', 'openai']);

const accelerator = z.string().refine((a) => validateAccelerator(a).ok, 'Invalid shortcut');

/** Only https endpoints, or http on the local machine (for local OpenAI-compatible servers). */
export const baseUrlSchema = z
  .string()
  .max(300)
  .refine((raw) => {
    try {
      const u = new URL(raw);
      if (u.username || u.password) return false;
      if (u.protocol === 'https:') return true;
      return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    } catch {
      return false;
    }
  }, 'Base URL must be https:// (http:// is allowed for localhost only)');

const modelName = z.string().trim().min(1).max(120).regex(/^[\w.:\-/@]+$/, 'Invalid model name');

export const settingsSchema = z.object({
  provider: providerSchema,
  models: z.object({ anthropic: modelName, openai: modelName, mock: modelName }),
  openaiBaseUrl: baseUrlSchema,
  transcriptionModel: modelName,
  temperature: z.number().min(0).max(2).nullable(),
  maxTokens: z.number().int().min(64).max(64_000),
  responseStyle: z.enum(['concise', 'balanced', 'detailed']),
  translateLanguage: z.string().trim().min(1).max(40).regex(/^[\p{L}\p{M} ()\-]+$/u, 'Invalid language'),
  theme: z.enum(['dark', 'light', 'system']),
  privacyMode: z.boolean(),
  alwaysOnTop: z.boolean(),
  compact: z.boolean(),
  launchAtLogin: z.boolean(),
  startMinimized: z.boolean(),
  hideOnCapture: z.boolean(),
  shortcuts: z.object({
    toggleWindow: accelerator,
    togglePrivacy: accelerator,
    ask: accelerator,
    capture: accelerator,
    toggleMeeting: accelerator,
    toggleCompact: accelerator,
  }),
});

export const settingsPatchSchema = settingsSchema
  .omit({ models: true, shortcuts: true })
  .extend({ models: settingsSchema.shape.models.partial(), shortcuts: settingsSchema.shape.shortcuts.partial() })
  .partial()
  .strict();

const field = z.string().max(LIMITS.contextFieldChars);
export const contextSchema = z
  .object({
    enabled: z.boolean(),
    topic: field,
    role: field,
    questions: field,
    notes: field,
    documents: z.string().max(LIMITS.documentChars),
    instructions: field,
  })
  .strict();

export const attachmentSchema = z
  .object({
    id: z.string().min(1).max(64),
    kind: z.literal('image'),
    mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
    data: z.string().min(1).max(LIMITS.attachmentBase64Chars).regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Not base64'),
    name: z.string().max(200).optional(),
  })
  .strict();

export const messageSchema = z
  .object({
    id: z.string().min(1).max(64),
    role: z.enum(['user', 'assistant']),
    content: z.string().max(LIMITS.messageChars),
    createdAt: z.number().finite(),
    attachments: z.array(attachmentSchema).max(LIMITS.attachmentsPerMessage).optional(),
    action: z.string().max(60).optional(),
    error: z.string().max(2000).optional(),
    mock: z.boolean().optional(),
  })
  .strict();

export const conversationSchema = z
  .object({
    id: idSchema,
    title: z.string().max(200),
    createdAt: z.number().finite(),
    updatedAt: z.number().finite(),
    messages: z.array(messageSchema).max(LIMITS.messagesPerConversation),
  })
  .strict();

export const meetingSchema = z
  .object({
    id: idSchema,
    title: z.string().max(200),
    startedAt: z.number().finite(),
    endedAt: z.number().finite().nullable(),
    transcript: z.string().max(LIMITS.transcriptChars),
    notes: z.string().max(LIMITS.transcriptChars),
    outputs: z
      .object({
        summary: z.string().max(LIMITS.messageChars),
        actionItems: z.string().max(LIMITS.messageChars),
        decisions: z.string().max(LIMITS.messageChars),
        followUps: z.string().max(LIMITS.messageChars),
        questions: z.string().max(LIMITS.messageChars),
      })
      .partial()
      .strict(),
    qa: z
      .array(
        z
          .object({
            id: z.string().min(1).max(64),
            question: z.string().max(LIMITS.contextFieldChars),
            answer: z.string().max(LIMITS.messageChars),
            createdAt: z.number().finite(),
          })
          .strict(),
      )
      .max(500),
  })
  .strict();

export const aiRequestSchema = z
  .object({
    requestId: idSchema,
    messages: z
      .array(
        z
          .object({
            role: z.enum(['user', 'assistant']),
            content: z.string().max(LIMITS.messageChars),
            attachments: z.array(attachmentSchema).max(LIMITS.attachmentsPerMessage).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(LIMITS.messagesPerConversation),
    mode: z.enum(['chat', 'meeting']).optional(),
    meeting: z
      .object({
        title: z.string().max(200),
        transcript: z.string().max(LIMITS.transcriptChars),
        notes: z.string().max(LIMITS.transcriptChars),
      })
      .strict()
      .optional(),
  })
  .strict();

export const apiKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(400)
  .regex(/^[\x21-\x7e]+$/, 'API keys cannot contain spaces or control characters');

export const overlayRectSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().gt(0).max(1),
    height: z.number().finite().gt(0).max(1),
  })
  .strict();

export const transcribeSchema = z
  .object({
    audio: z.instanceof(Uint8Array).refine((b) => b.byteLength > 0 && b.byteLength <= LIMITS.audioBytes, 'Audio clip is empty or too large'),
    mimeType: z.string().regex(/^audio\/(webm|ogg|wav|mp4|mpeg)(;.*)?$/),
  })
  .strict();
