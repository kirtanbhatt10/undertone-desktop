# Development

## Prerequisites

- Node.js 22 or newer, npm
- Windows 10 2004+/11 for Privacy Mode work; Linux and macOS work for everything else
- Linux only: `xvfb` to run the end-to-end tests without a display; `python3` + `libXtst` let the
  tests inject real global key presses (they fall back to checking registration otherwise)

## Setup

```bash
npm install
cp .env.example .env   # optional — the app runs in Mock mode without keys
npm run dev
```

`npm run dev` builds with esbuild in watch mode and launches Electron. Renderer changes: press
`Ctrl+R` in the window. Main-process or preload changes: restart. DevTools are available in
unpackaged builds (`Ctrl+Shift+I`).

> After your first `npm install`, commit the generated `package-lock.json`. The repository was
> bootstrapped without registry access, so it does not include one yet.

## Scripts

| Script | What it does |
| --- | --- |
| `npm start` | Production build, then launch |
| `npm run dev` | Watch build + launch |
| `npm run build` | Bundle to `out/` |
| `npm run typecheck` | `tsc --noEmit` for the Node side and the renderer |
| `npm test` | Unit tests (Node test runner via `tsx`) |
| `npm run test:e2e` | Build, then drive the real app with Playwright |
| `npm run test:privacy` | Build, then run only the Privacy Mode validation |
| `npm run screenshots` | Regenerate `docs/screenshots` (set `UNDERTONE_SHOTS=docs/screenshots`) |
| `npm run package[:win\|:linux]` | Build and package to `release/` |
| `npm run installer:win` | Windows setup program from the packaged build (needs `makensis`) |
| `npm run installer:linux` | `.deb` from the packaged build (needs `dpkg-deb`) |
| `npm run demo` | Re-record `docs/demo.gif` (needs `ffmpeg`) |
| `npm run scan:secrets` | Scan everything git would commit for credentials |

## Tests

- **Unit** (`tests/unit`): SSE parser, each provider against recorded stream formats and error
  statuses, provider fallback, prompt building, quick actions, accelerator handling, settings
  recovery, IPC schemas, collection path safety, secret storage, log redaction, privacy capability
  and probe logic.
- **End-to-end** (`tests/e2e`): launches the built app with an isolated data directory.
  - `app.test.ts` — startup, sandbox flags, streaming, context, copy/regenerate/stop, quick actions,
    image attach, region capture, meeting mode, history, settings validation, key handling, provider
    failure, shortcuts (rebinding, conflicts, real global key presses on Linux), compact mode,
    persistence across restart, full reset, dictation consent flow.
  - `provider.test.ts` — the OpenAI-compatible provider over real HTTP + SSE against
    `fakeProvider.ts`, asserting on the exact request the server received.
  - `privacy.test.ts` — see [PRIVACY_MODE.md](PRIVACY_MODE.md).

Headless Linux: `xvfb-run -a -s "-screen 0 1440x900x24" npm run test:e2e`.
When running as root in a container the tests pass `--no-sandbox` to Chromium; everywhere else the
sandbox stays on.

## Packaging

```bash
npm run package:win
```

produces `release/Undertone-win32-x64/` and `release/Undertone-<version>-win32-x64.zip`. The script
copies the Electron distribution (from `node_modules/electron/dist` for the host platform, otherwise
downloaded from the Electron GitHub release and checked against `SHASUMS256.txt`), renames the
executable, removes Electron's default app and adds `resources/app` containing only `out/`, the
icons and a minimal `package.json`.

### Installers

```bash
npm run package:win && npm run installer:win       # release/Undertone-Setup-<version>-x64.exe
npm run package:linux && npm run installer:linux   # release/undertone_<version>_amd64.deb
```

`scripts/installer.mjs` wraps the packaged folder; it does not rebuild anything.

- **Windows** uses NSIS (`sudo apt install nsis`, `brew install makensis` or `choco install nsis`),
  so the setup program can be built on Linux or macOS as well. It installs per user into
  `%LOCALAPPDATA%\Programs\Undertone` without administrator rights, adds Start menu and desktop
  shortcuts and an "Installed apps" entry, and supports silent install and uninstall with `/S`.
- **Linux** builds a `.deb` that installs to `/opt/Undertone` with a launcher entry, an icon and an
  `undertone` command.
- Uninstalling removes the program only. Conversations, settings and saved keys stay in the user
  data folder (`%APPDATA%\Undertone` or `~/.config/Undertone`).

Not done yet: code signing, auto-update, executable icon/version resources, ASAR, Electron fuses,
macOS. See the roadmap in the README.

## Releasing

1. Set the version in `package.json` and write `docs/releases/v<version>.md` (it becomes the
   release notes).
2. Merge to `main` and wait for CI.
3. Run the **Release** workflow on `main` with **publish** ticked (or push a `v<version>` tag).

The workflow builds the portable zips and both installers on Linux, then on clean
`windows-latest` and `ubuntu-latest` runners it checks the SHA-256 sums, installs silently, starts
the app, confirms it stays up and initialises its data folder, and uninstalls. Only if all of that
passes does it create the tag and the GitHub release with the files and `SHA256SUMS.txt`. Pull
requests that touch packaging run the same build and checks without publishing.

## Demo GIF

`npm run demo` drives the real app against the local stand-in model server
(`tests/e2e/recordDemo.ts`), screenshots the window about ten times a second and encodes the frames
with their real timing using `ffmpeg`. The **Demo GIF** workflow does the same on a virtual display
and pushes the result to the `demo-preview` branch so it can be reviewed before it is committed as
`docs/demo.gif`.

## Conventions

- TypeScript strict mode, `noUncheckedIndexedAccess`.
- Nothing in `src/shared` may import Electron, Node built-ins or the DOM.
- New IPC: add the channel to `shared/ipc.ts`, a schema to `main/schemas.ts`, a handler through the
  `handle()` wrapper, a method on `UndertoneApi`, and a test.
- Never log prompts, replies, transcripts, context or keys.
- User-facing text is plain and specific; errors say what to do next.
