# Verification status

What was actually checked for 0.1.0, and what was not. This page is deliberately conservative:
where something has not been verified, it says so.

Being precise about what was actually checked for 0.1.0. "CI" means the automated suite driving the
real app on GitHub-hosted runners: `windows-latest` (Windows build 10.0.26100) and `ubuntu-latest`.

| Area | Windows (CI) | Linux (CI + local) |
| --- | --- | --- |
| Clean `npm install`, typecheck, unit tests | ✅ | ✅ |
| App starts, UI loads, no crash without API config | ✅ | ✅ |
| Chat, streaming, stop, regenerate, copy, Markdown/code | ✅ | ✅ |
| Context passed to the model (asserted on the outgoing request) | ✅ | ✅ |
| OpenAI-compatible provider over real HTTP + SSE (local server) | ✅ | ✅ |
| Meeting mode, history, settings, persistence, reset | ✅ | ✅ |
| Region capture and image attach | ✅ | ✅ |
| Microphone dictation flow (fake audio device, mock transcriber) | ✅ | ✅ |
| Global shortcuts | ✅ registration, rebinding, conflicts — key presses not injected | ✅ including real key presses at the X server |
| Privacy Mode toggle, indicator, persistence | ✅ | ✅ |
| **Privacy Mode excludes the window from an OS screen capture** | ✅ OS reports the window as protected and it is absent from the capture; the control case (off ⇒ captured) passes | n/a — unsupported, and the app reports "exposed" |
| Production build | ✅ | ✅ |
| Portable package | ✅ cross-packaged from Linux, unzipped and started on `windows-latest` | ✅ built and launched |
| Installer | ✅ NSIS setup program: silent install, files, shortcut and "Installed apps" entry checked, app started, silent uninstall leaves user data | ✅ `.deb`: installed with `apt`, app started on a virtual display, removed |

"Started" for the packaged builds means the process was still running after 20 seconds and had
created its data folder; the feature tests above run against the unpackaged build. The checks live
in [`.github/workflows/release.yml`](../.github/workflows/release.yml) and run before every release.

Not verified:

- **The installer's interactive pages.** CI installs silently (`/S`); nobody has clicked through
  the setup wizard on a real desktop yet. Upgrading over an older version is also untested, since
  0.1.0 is the first release.
- **Linux distributions other than Ubuntu.** The `.deb` was installed on `ubuntu-latest` only.

- **A physical Windows desktop.** The Windows results come from a CI virtual machine. Nobody has yet
  used the app by hand on Windows, so visual polish, the tray, DPI scaling and multi-monitor
  behaviour are unchecked there.
- **Specific capture tools.** The Privacy Mode test captures through Electron's `desktopCapturer`
  (the Windows Graphics Capture / DXGI path). Teams, Zoom, Meet, OBS, Snipping Tool and the GDI
  path were not individually tested — try yours before relying on it.
- **Anthropic provider against the live API** (unit-tested against the documented stream format
  only), and live transcription against a real endpoint.
- **macOS** — untested, and not packaged.
- `scripts/privacy-check.ps1` has not been executed.
- There is **no `package-lock.json`** yet (the project was bootstrapped without registry access);
  run `npm install` and commit the lockfile. `npm audit` runs in CI but its result is advisory.

## Known limitations

- Verified on Windows in CI only, not yet on a physical Windows desktop; macOS is untested and not packaged (see the table above).
- Privacy Mode cannot protect against cameras, capture cards, remote-desktop tools, virtual machine
  hosts, or software that does not go through the OS compositor's capture path; on Linux it is unavailable.
- Live transcription is microphone-only (your side of the conversation) in ~20-second clips, and needs an
  OpenAI-compatible transcription endpoint. System/loopback audio is not captured.
- Documents are plain text; PDF and Word files must be pasted as text.
- No code signing or auto-update: Windows SmartScreen warns on first run, and new versions are
  installed by hand. The Windows `.exe` keeps the stock Electron file icon (the shortcuts, window
  and taskbar use Undertone's).
- Close Undertone (tray → Quit) before running the Windows installer over an existing install; the
  installer does not stop a running copy for you.
- "Launch at login" applies only to packaged builds on Windows and macOS.
- Conversations are sent in full each turn; very long chats can exceed a model's context window.
