# Privacy Mode

> Privacy Mode protects this window from supported screen-capture APIs. It cannot guarantee
> invisibility from cameras, external capture devices, or unsupported capture mechanisms.

This document says exactly what Privacy Mode does, what it does not do, and how to check it on your
own machine. It is deliberately conservative: where something has not been verified, it says so.

## What it is for

When you share your screen in a call, everything on that screen is broadcast. Privacy Mode asks the
operating system to leave the Undertone window out of screen captures so that your notes, context
and assistant are not shared along with your slides. The window stays fully visible to you.

## How it works

Undertone calls Electron's [`BrowserWindow.setContentProtection()`](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows),
which maps to one documented OS call per platform. There are no hooks, no injection into other
processes, no drivers, and no attempt to hide the process.

| Platform | OS call | Effect |
| --- | --- | --- |
| Windows 10 version 2004 (build 19041) and later, Windows 11 | [`SetWindowDisplayAffinity`](https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-setwindowdisplayaffinity)`(hwnd, WDA_EXCLUDEFROMCAPTURE)` | The window is shown on the monitor and omitted from captures |
| Windows 10 before 2004, Windows 8.x | `SetWindowDisplayAffinity(hwnd, WDA_MONITOR)` | The window's area is captured as a **black rectangle** — content is hidden, but the window's presence is not |
| macOS | `NSWindow.sharingType = .none` | Hidden from legacy capture APIs only (see limitations) |
| Linux (X11 / Wayland) | — | No supported mechanism |

Code: [`src/main/privacy.ts`](../src/main/privacy.ts) (apply, read-back, self-test) and
[`src/main/privacyProbe.ts`](../src/main/privacyProbe.ts) (capability detection and probe analysis).

Behaviour worth knowing:

- Protection is applied **before the window is first shown** when Privacy Mode was left on.
- The setting persists across restarts.
- The screen-region capture overlay gets the same protection while Privacy Mode is on.
- Toggle with the title-bar pill, **Settings → Privacy Mode**, the tray menu, or the global shortcut
  (`Ctrl+Alt+P` by default).

## How the app tells you the truth

| Indicator | Meaning |
| --- | --- |
| `Visible to capture` (grey) | Privacy Mode is off |
| `Privacy on` (green) + thin green window outline | On, and the OS supports full exclusion |
| `Privacy · partial` (amber) | On, but the OS can only black out the window, or may not honour the flag |
| `Privacy · unsupported` (amber) | On, but the OS has no mechanism — **the window is still capturable** |

Settings shows the detected mechanism and the notice quoted at the top of this page at all times.

## Capture methods on Windows (build 19041+)

**Expected to be protected.** These all obtain pixels from the Desktop Window Manager, which honours
the display affinity. This is the behaviour Microsoft documents for `WDA_EXCLUDEFROMCAPTURE`
("the window is displayed only on a monitor; everywhere else, the window does not appear at all").

| Capture path | Typical users |
| --- | --- |
| Windows.Graphics.Capture | Teams, Zoom, Meet/Chrome/Edge screen sharing, Snipping Tool, Xbox Game Bar, OBS "Windows 10+" capture |
| DXGI Desktop Duplication | OBS display capture, Discord, many recorders, Electron/Chromium `desktopCapturer` |
| GDI screen copy (`BitBlt` from the screen DC, `CopyFromScreen`) | Print Screen, older screenshot tools |

**Not guaranteed, or not protected.** Do not rely on Privacy Mode against any of these:

- A camera or phone pointed at the screen, or another person looking at it
- HDMI/DisplayPort capture cards, hardware KVMs and any capture taken from the video signal
- Capture from **outside the Windows session**: a virtual-machine host, hypervisor console, some
  remote-desktop and remote-support tools, cloud PC streaming
- Software using kernel drivers, mirror drivers or other non-DWM techniques
- Accessibility and UI Automation APIs, screen readers, and anything else that reads window
  *content* rather than pixels
- Other processes running as you: they can read Undertone's data files directly
- OS surfaces that are not Undertone's window: the taskbar button, Alt+Tab entry, tray icon and its
  menu, native file pickers and tooltips. The app remains listed in Task Manager — by design
- Windows builds older than 19041, where the window is blacked out rather than removed

## Other platforms

- **macOS.** `sharingType = .none` is honoured by the older CoreGraphics capture APIs. Apps that
  capture with ScreenCaptureKit — the default on macOS 15 and later, and common before that — can
  still include the window. Undertone therefore reports macOS as *partial* and you should assume the
  window may be visible. macOS has not been tested at all for this release.
- **Linux.** Neither X11 nor Wayland compositors expose an equivalent. Privacy Mode can be switched
  on (so the setting carries across machines), but the pill reads `Privacy · unsupported` and the
  self-test reports `Exposed`.

## What happens when protection is unsupported

Nothing fails silently. The capability card in Settings states "Not supported on this system", the
pill turns amber, a warning toast appears when you switch it on, and the self-test result is
`Exposed: the window is visible in screen captures. This operating system has no supported
capture-exclusion mechanism.`

## Validating it yourself

### 1. In-app self-test (any OS)

**Settings → Privacy Mode → Run capture self-test.** The window briefly fills with a test colour,
Undertone takes *one* screenshot of that display through the OS capture API (DXGI / Windows Graphics
Capture on Windows), and looks for the test colour where the window is. The image is analysed in
memory and discarded.

| Result | Meaning |
| --- | --- |
| `Protected` | Privacy Mode on, window absent from the capture |
| `Exposed` | Privacy Mode on, window **present** in the capture — do not rely on it here |
| `Visible, as expected` | Privacy Mode off and the window was captured (this is the control) |
| `Inconclusive` | The window was hidden, covered or off-screen, or the capture failed |

On Windows, **Read window display affinity** additionally asks the OS for the window's current
affinity (`GetWindowDisplayAffinity`): `0x11` = excluded, `0x1` = monitor-only, `0x0` = none.

### 2. Automated test

```bash
npm run test:privacy
```

[`tests/e2e/privacy.test.ts`](../tests/e2e/privacy.test.ts) launches the real app and asserts, per
platform: the control case (off ⇒ captured), `isContentProtected()` as reported by the OS, the
self-test verdict (on Windows 19041+ it **must** be `protected`), the UI indicators, persistence
across a restart, and toggling off again.

### 3. From outside the app (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File scripts\privacy-check.ps1
```

Reads the display affinity of the running window from a separate process and saves a GDI capture of
the window's screen area to a PNG for you to inspect.

### 4. By hand

Start a call with yourself (or use Snipping Tool / OBS), share your **entire screen**, and look at
the shared picture on a second device.

## Verification status for 0.1.0

| Check | Status |
| --- | --- |
| Capability detection for every platform / build | ✅ unit-tested |
| Probe analysis and verdict logic | ✅ unit-tested |
| Control case: an unprotected window is detected in an OS capture | ✅ Windows and Linux (real app, CI) |
| **Window excluded from an OS screen capture on Windows** | ✅ `windows-latest` CI runner, Windows build 10.0.26100: the OS reports the window as content-protected and it is absent from a capture taken through Electron's `desktopCapturer` (Windows Graphics Capture / DXGI) |
| Protection still applied after restart, and removed when switched off | ✅ Windows and Linux (CI) |
| Honest "unsupported / exposed" reporting | ✅ Linux (real app) |
| Toggle by global shortcut with real key presses | ✅ Linux only |
| Individual capture tools (Teams, Zoom, Meet, OBS, Snipping Tool), GDI path | ❌ not individually tested |
| A physical Windows machine, older Windows builds (`WDA_MONITOR` fallback) | ❌ not tested |
| `scripts/privacy-check.ps1` | ❌ not yet executed |
| macOS | ❌ not tested |

So: the mechanism is confirmed to work on current Windows for the capture path that screen-sharing
apps are built on, on a CI virtual machine. That is good evidence, not a guarantee for every tool —
run the in-app self-test, and check your own meeting app once, before depending on it.

## Responsible use

Privacy Mode keeps *your* window out of *your* screen share. It is not a tool for concealing
assistance where assistance is not allowed, and it will not defeat proctoring or monitoring
software — it makes no attempt to. Follow the rules of the meeting, interview or assessment you are
in, and get consent before recording or transcribing other people.
