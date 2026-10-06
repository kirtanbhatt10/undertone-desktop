<#
.SYNOPSIS
  Independent Windows check of Undertone's Privacy Mode, from outside the app.

.DESCRIPTION
  1. Finds the running Undertone window.
  2. Asks Windows for its display affinity (GetWindowDisplayAffinity).
  3. Takes a GDI screen capture (the classic BitBlt path used by Print Screen-style tools)
     of the area the window occupies and saves it as a PNG so you can look at it.

  With Privacy Mode ON you should see affinity 0x11 (WDA_EXCLUDEFROMCAPTURE) and a PNG that
  shows whatever is BEHIND the Undertone window. With Privacy Mode OFF: 0x0 and a PNG of the window.

  NOTE: This script was written against the documented Win32 API but was not executed in the
  Linux environment the project was first built in. Treat its output as a helper, and report
  problems in an issue.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\privacy-check.ps1
#>
param([string]$OutFile = "$env:TEMP\undertone-privacy-check.png")

Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class UndertoneCheck {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll", SetLastError = true)] public static extern bool GetWindowDisplayAffinity(IntPtr hWnd, out uint affinity);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
"@
[void][UndertoneCheck]::SetProcessDPIAware()

$proc = Get-Process | Where-Object { $_.MainWindowTitle -eq 'Undertone' -and $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $proc) { Write-Error 'Undertone is not running, or its window is hidden. Open the window and try again.'; exit 2 }
$hwnd = $proc.MainWindowHandle

$affinity = [uint32]0
if (-not [UndertoneCheck]::GetWindowDisplayAffinity($hwnd, [ref]$affinity)) { Write-Error 'GetWindowDisplayAffinity failed.'; exit 3 }
$label = switch ($affinity) {
  0  { 'WDA_NONE - the window is NOT protected' }
  1  { 'WDA_MONITOR - shown as a black rectangle in captures' }
  17 { 'WDA_EXCLUDEFROMCAPTURE - excluded from captures' }
  default { "unknown (0x{0:X})" -f $affinity }
}
Write-Host ("Windows build      : {0}" -f [Environment]::OSVersion.Version)
Write-Host ("Display affinity   : 0x{0:X}  {1}" -f $affinity, $label)

$rect = New-Object UndertoneCheck+RECT
[void][UndertoneCheck]::GetWindowRect($hwnd, [ref]$rect)
$w = $rect.Right - $rect.Left; $h = $rect.Bottom - $rect.Top
if ($w -gt 0 -and $h -gt 0) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $bmp.Size)
  $bmp.Save($OutFile, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Write-Host "GDI capture saved  : $OutFile"
  Write-Host 'Open the PNG: with Privacy Mode on, the Undertone window should be absent from it.'
}
if ($affinity -eq 17) { exit 0 } else { exit 1 }
