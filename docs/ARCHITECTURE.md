# Architecture

Undertone is an Electron app with three strictly separated layers. The rule of thumb: **the
renderer draws, the main process decides.**

```
src/
├── shared/            Pure TypeScript used by both sides (no Electron, no DOM)
│   ├── types.ts         Data model and IPC payload types
│   ├── ipc.ts           Every IPC channel name
│   ├── defaults.ts      Default settings, limits, user-facing notices
│   ├── prompt.ts        System-prompt construction from context / meeting
│   ├── actions.ts       Quick actions and meeting tools
│   └── accelerator.ts   Shortcut validation and formatting
├── main/              Node side: the only place with secrets, files and network
│   ├── index.ts         Lifecycle, IPC handlers, hardening
│   ├── schemas.ts       zod schemas for every IPC argument and stored document
│   ├── ai/              Provider abstraction (see below)
│   ├── store/           jsonFile (atomic writes) · collection · settings · secrets
│   ├── privacy.ts       Content protection, affinity read-back, capture self-test
│   ├── privacyProbe.ts  Pure capability detection + probe analysis
│   ├── capture.ts       One-shot region capture and its overlay window
│   ├── shortcuts.ts     Global shortcut registration and status
│   ├── windows.ts       Main window, full/compact bounds, state persistence
│   ├── tray.ts · logger.ts · env.ts · paths.ts
├── preload/           contextBridge: a fixed, typed API per window
│   ├── api.ts           The `UndertoneApi` / `OverlayApi` contracts
│   ├── index.ts         Main-window bridge
│   └── overlay.ts       Capture-overlay bridge (three methods)
└── renderer/          Sandboxed React UI
    ├── index.html · overlay.html   (each with its own CSP)
    └── src/
        ├── store.ts       App state and every user action (useSyncExternalStore)
        ├── views/         Assistant · Meeting · History · Settings
        ├── components/    TitleBar · Sidebar · ContextPanel · Markdown · ui · icons
        └── lib/           markdown (marked + DOMPurify + highlight.js) · images · recorder · format
```

## Process boundaries

| | Main | Preload | Renderer |
| --- | --- | --- | --- |
| Node.js / filesystem | yes | `ipcRenderer` only | **no** (`sandbox: true`, `contextIsolation: true`) |
| Network | yes (`net.fetch`) | no | **no** (`connect-src 'none'`) |
| API keys | yes | no | **never** — it only sees `stored / session / env / none` |

The preload exposes `window.undertone` with one method per operation. There is no generic
`invoke(channel, …)`, so a compromised renderer cannot reach an arbitrary channel.

Every `ipcMain.handle` goes through one wrapper in `main/index.ts` that:

1. rejects calls that do not come from the app's own page in the expected window's main frame,
2. parses the argument with a zod schema (strict objects, size limits, UUID ids, validated URLs),
3. converts failures into a short message, logging unexpected ones.

## Data flow: one chat turn

```
Composer ──sendMessage()──▶ store.ts ──api.startAi({requestId, messages})──▶ preload ──IPC──▶ main
                                                                                         │ validate
                                                                                         │ resolveProvider(settings, secrets)
                                                                                         │ buildSystemPrompt(context, style, meeting?)
                                                                                         ▼
                                                               provider.stream(…, onDelta) ──HTTPS/SSE──▶ model API
store.ts ◀──onAiEvent({start | delta | done | error})◀── webContents.send ◀── onDelta ◀──────────────────┘
   │ patches the assistant message as text arrives
   ▼
api.saveConversation() ──▶ main ──▶ data/conversations/<uuid>.json (atomic write)
```

Context is read from the main process's copy at request time, so the renderer cannot inject a
system prompt; it can only edit the context fields through `setContext`, which is validated.

## AI providers

```ts
interface ChatProvider {
  readonly id: ProviderId;
  readonly label: string;
  stream(req: StreamRequest, onDelta: (text: string) => void): Promise<void>;
  listModels?(signal: AbortSignal): Promise<string[]>;
  transcribe?(audio: Uint8Array, mimeType: string, model: string, signal: AbortSignal): Promise<string>;
}
```

| Provider | File | Notes |
| --- | --- | --- |
| Anthropic | `ai/anthropic.ts` | Messages API, SSE `content_block_delta`, image blocks |
| OpenAI-compatible | `ai/openai.ts` | Chat Completions SSE, `image_url` parts, `/audio/transcriptions`; works with OpenAI, Ollama, LM Studio, gateways |
| Mock | `ai/mock.ts` | Offline, deterministic, echoes what it received — used when no key is set and by the tests |

`ai/index.ts` is the only file that maps a provider id to a class. To add a provider: implement the
interface, add the id to `ProviderId` and the settings schema, register it in `resolveProvider`, and
add a segment in the Settings view. Providers receive an injected `fetch`, which is how the unit
tests feed them recorded streams.

Errors are normalised to `AiError` codes (`auth`, `rate_limit`, `network`, `bad_request`, `server`,
`aborted`) with messages written for end users.

## Persistence

Everything lives under the OS user-data directory (`%APPDATA%\Undertone` on Windows), or
`UNDERTONE_USER_DATA` if set:

```
data/settings.json           validated on load; invalid fields fall back to defaults individually
data/context.json
data/secrets.json            base64 of safeStorage-encrypted keys (absent if encryption is unavailable)
data/window-state.json
data/conversations/<uuid>.json
data/meetings/<uuid>.json
logs/undertone.log           metadata only, redacted, rotated at 1 MB
```

Plain JSON files were chosen over SQLite to avoid native modules (simpler cross-platform builds) —
at the expected scale of hundreds of conversations, listing them is fast enough. Writes are atomic
(temp file + rename). Collection ids are validated as UUIDs before touching the filesystem.

## Windows and modes

One `BrowserWindow`, frameless with a custom title bar. *Compact mode* is the same window at a
smaller, always-on-top size; the CSS responds to the available width (media and container queries),
so the layout also adapts when the full window is simply resized. Bounds are remembered per mode.
Closing the window hides it to the tray; quitting is explicit.

The capture overlay is a second, short-lived window with its own minimal preload and CSP. It shows
one frozen frame and returns only a normalised rectangle; cropping happens in the main process.

## Build

`scripts/build.mjs` uses esbuild to produce three bundles (`out/main`, `out/preload`,
`out/renderer`). All dependencies are bundled, so the packaged app ships no `node_modules`.
`scripts/package.mjs` lays the bundles into an Electron distribution and zips it.
