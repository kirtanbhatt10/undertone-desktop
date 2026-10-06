import http from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  path: string;
  authorization: string;
  body: { model?: string; stream?: boolean; messages?: Array<{ role: string; content: unknown }>; [k: string]: unknown };
}

const CHAT = `Open with the outcome, not the agenda. For a roadmap review that usually means three beats:

1. **Where we landed** — one sentence on last quarter against plan.
2. **What changes** — the two bets you are asking the room to back.
3. **What you need** — the decision you want before the hour is up.

> "By the end of this session I'd like a yes or no on moving the billing migration ahead of search."

A quick way to keep the numbers honest while you talk:

\`\`\`ts
const confidence = shipped / committed; // 0.82 last quarter
const buffer = Math.ceil(remaining * (1 - confidence));
\`\`\`

Keep it under ninety seconds, then hand over to the first owner.`;

const MEETING: Array<[RegExp, string]> = [
  [/Summarize this meeting/, `**Beta ships Friday; billing migration moves ahead of search.**

- The beta is on track for a Friday release, pending one open crash fix.
- Billing migration was pulled forward because two enterprise renewals depend on it.
- Search relevance work slips to next quarter with no objections.
- Design will share the onboarding revision on Wednesday.`],
  [/action item/, `- [ ] Fix the cold-start crash before the beta cut — Ravi — Thursday
- [ ] Draft release notes — Ana — Thursday
- [ ] Confirm migration window with the two enterprise accounts — Mei — no date
- [ ] Share onboarding revision — unassigned — Wednesday`],
  [/decisions/, `**Decided**
- Ship the beta on Friday — the crash fix is small and already in review.
- Move billing migration ahead of search — renewals depend on it.

**Still open**
- Whether the migration needs a maintenance window.`],
  [/follow-up/, `- Thanks all — beta is confirmed for Friday, release notes to follow Thursday.
- Mei, can you confirm the migration window with both accounts by Tuesday?
- Search relevance moves to next quarter; I'll update the roadmap doc today.`],
  [/questions I could ask/, `1. What is the rollback plan if the crash fix regresses on Friday?
2. Who signs off on the migration window with each account?
3. Does moving search out affect the Q4 retention target?
4. What is the smallest onboarding change we could ship with the beta?
5. Which metric tells us on Monday that the beta went well?`],
  [/Question:/, `Friday. The beta ships then, provided Ravi's cold-start crash fix lands by Thursday.`],
];

function pick(body: RecordedRequest['body']): string {
  const messages = body.messages ?? [];
  const last = messages[messages.length - 1];
  const text = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? '');
  const system = typeof messages[0]?.content === 'string' ? messages[0].content : '';
  if (system.includes('<transcript>')) for (const [re, reply] of MEETING) if (re.test(text)) return reply;
  return CHAT;
}

/** A tiny local server that speaks the OpenAI Chat Completions streaming protocol. */
export async function startFakeProvider(): Promise<{ url: string; requests: RecordedRequest[]; close(): Promise<void> }> {
  const requests: RecordedRequest[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const authorization = String(req.headers.authorization ?? '');
      if (req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'local-large' }, { id: 'local-small' }] }));
      }
      if (authorization !== 'Bearer sk-local-test-key-0001') {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: { message: 'bad key' } }));
      }
      const body = JSON.parse(raw || '{}') as RecordedRequest['body'];
      requests.push({ path: req.url ?? '', authorization, body });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const pieces = pick(body).match(/\S+\s*|\s+/g) ?? [];
      let i = 0;
      const timer = setInterval(() => {
        if (i >= pieces.length) {
          clearInterval(timer);
          res.write('data: [DONE]\n\n');
          return res.end();
        }
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[i++] } }] })}\n\n`);
      }, 6);
      res.on('close', () => clearInterval(timer));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { url: `http://localhost:${port}/v1`, requests, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
