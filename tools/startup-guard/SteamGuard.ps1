param(
    [int]$InitialDelaySeconds = 0,
    [int]$WindowWaitSeconds = 75,
    [int]$SettleSeconds = 45,
    [switch]$DisableCefGpu,
    [string]$LogDirectory = "$env:LOCALAPPDATA\CodexStartupGuard"
)

$ErrorActionPreference = "Continue"

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$LogPath = Join-Path $LogDirectory "steam-guard.log"

function Write-GuardLog {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogPath -Value "[$stamp] $Message" -Encoding UTF8
}

function Add-Win32Api {
    $code = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class SteamGuardWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr extra);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder text, int max);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@
    Add-Type $code -ErrorAction SilentlyContinue
}

function Get-SteamExe {
    $reg = Get-ItemProperty "HKCU:\Software\Valve\Steam" -ErrorAction SilentlyContinue
    if ($reg -and $reg.SteamExe -and (Test-Path $reg.SteamExe)) {
        return $reg.SteamExe
    }

    $fallback = "D:\Program Files (x86)\Steam\steam.exe"
    if (Test-Path $fallback) {
        return $fallback
    }

    return $null
}

function Get-SteamWindows {
    $targetPids = @{}
    Get-Process -Name steam,steamwebhelper -ErrorAction SilentlyContinue | ForEach-Object {
        $targetPids[[uint32]$_.Id] = $_.ProcessName
    }

    $rows = New-Object System.Collections.Generic.List[object]
    [SteamGuardWin32]::EnumWindows({
        param([IntPtr]$handle, [IntPtr]$unused)

        [uint32]$windowPid = 0
        [void][SteamGuardWin32]::GetWindowThreadProcessId($handle, [ref]$windowPid)
        if ($targetPids.ContainsKey($windowPid)) {
            $title = New-Object Text.StringBuilder 512
            [void][SteamGuardWin32]::GetWindowText($handle, $title, 512)

            $class = New-Object Text.StringBuilder 256
            [void][SteamGuardWin32]::GetClassName($handle, $class, 256)

            $rect = New-Object SteamGuardWin32+RECT
            [void][SteamGuardWin32]::GetWindowRect($handle, [ref]$rect)

            $width = $rect.Right - $rect.Left
            $height = $rect.Bottom - $rect.Top
            $rows.Add([pscustomobject]@{
                Process = $targetPids[$windowPid]
                Pid = $windowPid
                Handle = $handle
                HandleHex = ("0x{0:X}" -f $handle.ToInt64())
                Visible = [SteamGuardWin32]::IsWindowVisible($handle)
                Minimized = [SteamGuardWin32]::IsIconic($handle)
                Class = $class.ToString()
                Title = $title.ToString()
                X = $rect.Left
                Y = $rect.Top
                W = $width
                H = $height
                Rect = ("{0},{1},{2},{3}" -f $rect.Left, $rect.Top, $rect.Right, $rect.Bottom)
            })
        }

        return $true
    }, [IntPtr]::Zero) | Out-Null

    return $rows
}

function Show-SteamMainWindow {
    $windows = Get-SteamWindows
    $main = $windows |
        Where-Object { $_.Class -eq "Chrome_WidgetWin_0" -and $_.W -gt 500 -and $_.H -gt 400 } |
        Sort-Object @{ Expression = "Visible"; Descending = $true }, @{ Expression = "W"; Descending = $true } |
        Select-Object -First 1

    if (-not $main) {
        Write-GuardLog "No large Steam UI window found."
        return $false
    }

    [SteamGuardWin32]::ShowWindowAsync($main.Handle, 9) | Out-Null
    [SteamGuardWin32]::SetWindowPos($main.Handle, [IntPtr]::Zero, 160, 120, 1536, 864, 0x0040) | Out-Null
    [SteamGuardWin32]::BringWindowToTop($main.Handle) | Out-Null
    [SteamGuardWin32]::SetForegroundWindow($main.Handle) | Out-Null
    Write-GuardLog "Brought Steam UI to front. handle=$($main.HandleHex) pid=$($main.Pid) visible=$($main.Visible) rect=$($main.Rect)"
    return $true
}

function Restart-SteamWebHelper {
    $helpers = Get-Process -Name steamwebhelper -ErrorAction SilentlyContinue
    if (-not $helpers) {
        Write-GuardLog "No steamwebhelper processes to restart."
        return
    }

    $helperIds = @($helpers | Select-Object -ExpandProperty Id)
    Write-GuardLog "Restarting steamwebhelper PIDs via child process: $(($helperIds -join ', '))"

    $pwsh = (Get-Process -Id $PID).Path
    $pidLiteral = ($helperIds -join ",")
    $script = @"
Start-Sleep -Seconds 1
foreach (`$id in @($pidLiteral)) {
    Stop-Process -Id `$id -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 5
Start-Process 'steam://open/library'
"@
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process -FilePath $pwsh -ArgumentList @("-NoLogo", "-NoProfile", "-WindowStyle", "Hidden", "-EncodedCommand", $encoded) -WindowStyle Hidden
}

function Watch-SteamUiAfterFirstShow {
    param([int]$Seconds)

    if ($Seconds -le 0) {
        return
    }

    Write-GuardLog "Watching Steam UI for $Seconds seconds after first show."
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        [void](Show-SteamMainWindow)
    }
}

if ($InitialDelaySeconds -gt 0) {
    Write-GuardLog "Initial delay: $InitialDelaySeconds seconds."
    Start-Sleep -Seconds $InitialDelaySeconds
}

Add-Win32Api

$steamExe = Get-SteamExe
if (-not $steamExe) {
    Write-GuardLog "Steam executable not found."
    exit 2
}

$steamProcess = Get-Process -Name steam -ErrorAction SilentlyContinue
if (-not $steamProcess) {
    $args = @("-silent")
    if ($DisableCefGpu) {
        $args += "-cef-disable-gpu"
    }

    Write-GuardLog "Starting Steam: $steamExe $($args -join ' ')"
    Start-Process -FilePath $steamExe -ArgumentList $args
} else {
    Write-GuardLog "Steam already running. PIDs: $((($steamProcess | Select-Object -ExpandProperty Id) -join ', '))"
}

Start-Sleep -Seconds 3
Start-Process "steam://open/library"

$shown = $false
$deadline = (Get-Date).AddSeconds($WindowWaitSeconds)
while ((Get-Date) -lt $deadline) {
    if (Show-SteamMainWindow) {
        $shown = $true
        break
    }

    Start-Sleep -Seconds 5
}

if (-not $shown) {
    Write-GuardLog "Steam UI was not visible after wait. Restarting WebHelper once."
    Restart-SteamWebHelper

    $restartDeadline = (Get-Date).AddSeconds([math]::Max(90, [math]::Min(180, $WindowWaitSeconds)))
    while ((Get-Date) -lt $restartDeadline) {
        Start-Sleep -Seconds 5
        if (Show-SteamMainWindow) {
            $shown = $true
            break
        }
    }

    if (-not $shown) {
        Write-GuardLog "Steam UI still not visible after WebHelper restart wait."
    }
}

if ($shown) {
    Watch-SteamUiAfterFirstShow -Seconds $SettleSeconds
}

Write-GuardLog "SteamGuard finished."
