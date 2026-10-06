# Security

## Reporting a vulnerability

Please do not open a public issue for security problems. Use GitHub's **private vulnerability
reporting** on this repository (Security → Report a vulnerability) and include reproduction steps.

## Threat model in brief

Undertone renders untrusted text (model output, pasted documents) and holds API keys and private
notes. The design goal is that a malicious model reply or document cannot run code, reach the
network, read files, or obtain a key.

## Review checklist (0.1.0)

| Area | Status | Notes |
| --- | --- | --- |
| Hard-coded secrets / keys | ✅ none | `npm run scan:secrets` passes; test fixtures use obviously fake values |
| `.env`, credentials, local data in git | ✅ ignored | `.gitignore`; the secret scan also fails on those file types |
| Renderer isolation | ✅ | `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, `webviewTag: false`; asserted in the e2e tests |
| IPC surface | ✅ | Fixed preload API, no generic invoke; every handler checks the sender frame and validates input with zod |
| XSS | ✅ | Model output → marked → DOMPurify with a tag/attribute allow-list; links limited to http(s)/mailto and opened externally; only `data:` images; CSP `default-src 'none'`, `script-src 'self'`, `connect-src 'none'` |
| Navigation / new windows | ✅ | `will-navigate` blocked outside the app's own files; `setWindowOpenHandler` denies; `openExternal` accepts only `https:` and `mailto:` |
| Command execution | ✅ | One `execFile` (Windows affinity read-back) with a fixed PowerShell path, fixed script and a digits-only window handle; no shell, no user input |
| File access | ✅ | Renderer has none. Main reads/writes only inside the user-data directory; document ids are UUID-validated so paths cannot be steered |
| Input validation | ✅ | Size limits on messages, context, transcripts, attachments and audio; strict schemas reject unknown keys |
| Network egress | ✅ | Only the configured provider endpoint; base URL must be `https://` or `http://localhost` |
| Secrets at rest | ✅ | `safeStorage` (DPAPI / Keychain / libsecret); memory-only when unavailable; never returned to the renderer |
| Sensitive data in logs | ✅ | Logs carry metadata only and pass through a redactor; unit-tested |
| Permissions | ✅ | Only microphone (audio) and clipboard write are granted, and only to the main window |
| Screen capture | ✅ | Only on explicit user action (capture button/shortcut, privacy self-test); one frame; never continuous |
| Dependency vulnerabilities | ⚠️ **not checked** | `npm audit` could not run where the project was built (no registry access). Run it after `npm install`; CI runs it on every push |

## Known gaps

- **History is stored unencrypted** as JSON in your user profile. Anyone with access to your account
  or disk can read it. Use full-disk encryption; delete history from the app when needed.
- **No code signing, no ASAR integrity, Electron fuses at defaults** in the portable build. The
  packaged executable can be run as plain Node via `ELECTRON_RUN_AS_NODE` and its `resources/app`
  files can be modified by anything that can write to the install folder. Keep it in a
  user-writable-only location until signed installers exist.
- `style-src` allows `'unsafe-inline'` (React inline styles). Scripts remain `'self'` only.
- When OS secure storage is missing (some Linux desktops), keys entered in the UI last only for the
  session; environment variables are then the persistent option and are readable by local processes.
- Content you send is processed by the AI provider you configure, under that provider's terms.

## Privacy Mode

Privacy Mode is a screen-capture exclusion flag, not a security boundary. See
[docs/PRIVACY_MODE.md](docs/PRIVACY_MODE.md) for its exact scope.
