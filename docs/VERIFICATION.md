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
| Portable package | built (cross-packaged from Linux), **not launched** | ✅ built and launched |

Not verified:

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
- Portable builds only: no installer, auto-update or code signing, and the Windows `.exe` keeps the
  stock Electron file icon (the window and taskbar icon are Undertone's).
- "Launch at login" applies only to packaged builds on Windows and macOS.
- Conversations are sent in full each turn; very long chats can exceed a model's context window.
