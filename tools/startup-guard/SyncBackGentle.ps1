param(
    [string]$Profile = "D",
    [int]$UserIdleMinutes = 10,
    [int]$MaxWaitMinutes = 240,
    [int]$PollSeconds = 30,
    [int]$DiskBusyThreshold = 80,
    [string[]]$WatchedDrives = @("D:", "Z:"),
    [switch]$DryRun,
    [string]$LogDirectory = "$env:LOCALAPPDATA\CodexStartupGuard"
)

$ErrorActionPreference = "Continue"

New-Item -ItemType Directory -Force -Path $LogDirectory | Out-Null
$LogPath = Join-Path $LogDirectory "syncback-gentle.log"

function Write-GuardLog {
    param([string]$Message)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $LogPath -Value "[$stamp] $Message" -Encoding UTF8
}

function Add-IdleApi {
    $code = @"
using System;
using System.Runtime.InteropServices;

public class GentleIdleWin32 {
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO {
    public uint cbSize;
    public uint dwTime;
  }

  [DllImport("user32.dll")]
  public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);

  [DllImport("kernel32.dll")]
  public static extern uint GetTickCount();
}
"@
    Add-Type $code -ErrorAction SilentlyContinue
}

function Get-UserIdleSeconds {
    $info = New-Object GentleIdleWin32+LASTINPUTINFO
    $info.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($info)
    if (-not [GentleIdleWin32]::GetLastInputInfo([ref]$info)) {
        return 0
    }

    $idleMs = [GentleIdleWin32]::GetTickCount() - $info.dwTime
    return [math]::Max(0, [int]($idleMs / 1000))
}

function Get-DriveBusyPercent {
    param([string[]]$Drives)

    $paths = foreach ($drive in $Drives) {
        $letter = $drive.TrimEnd("\").TrimEnd(":")
        "\LogicalDisk($letter`:)\% Disk Time"
    }

    try {
        $samples = Get-Counter -Counter $paths -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop
        $max = 0
        foreach ($sample in $samples.CounterSamples) {
            $value = [math]::Round($sample.CookedValue, 0)
            if ($value -gt $max) {
                $max = $value
            }
        }

        return [math]::Min(100, $max)
    } catch {
        Write-GuardLog "Disk counter unavailable, continuing without disk wait. Error=$($_.Exception.Message)"
        return 0
    }
}

function Test-NightWindow {
    $hour = (Get-Date).Hour
    return ($hour -ge 0 -and $hour -lt 7)
}

function Get-SyncBackExe {
    $candidates = @(
        "C:\Program Files (x86)\2BrightSparks\SyncBackFree\SyncBackFree.exe",
        "C:\Program Files\2BrightSparks\SyncBackFree\SyncBackFree.exe"
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    return $null
}

Add-IdleApi

$syncBackExe = Get-SyncBackExe
if (-not $syncBackExe) {
    Write-GuardLog "SyncBackFree executable not found."
    exit 2
}

$alreadyRunning = Get-Process -Name SyncBackFree -ErrorAction SilentlyContinue
if ($alreadyRunning) {
    Write-GuardLog "SyncBackFree is already running. PIDs: $((($alreadyRunning | Select-Object -ExpandProperty Id) -join ', ')). Exiting to avoid duplicate backup."
    exit 0
}

$deadline = (Get-Date).AddMinutes($MaxWaitMinutes)
Write-GuardLog "Waiting for gentle window. profile=$Profile idle=$UserIdleMinutes min maxWait=$MaxWaitMinutes min drives=$($WatchedDrives -join ',')"

while ((Get-Date) -lt $deadline) {
    $idleSeconds = Get-UserIdleSeconds
    $idleMinutesNow = [math]::Round($idleSeconds / 60, 1)
    $diskBusy = Get-DriveBusyPercent -Drives $WatchedDrives
    $night = Test-NightWindow

    if (($night -or $idleSeconds -ge ($UserIdleMinutes * 60)) -and $diskBusy -lt $DiskBusyThreshold) {
        Write-GuardLog "Gentle window reached. idle=$idleMinutesNow min diskBusy=$diskBusy night=$night"
        break
    }

    Write-GuardLog "Waiting. idle=$idleMinutesNow min diskBusy=$diskBusy night=$night"
    Start-Sleep -Seconds $PollSeconds
}

$arguments = @(
    "-nosplash",
    "-procpriority", "1",
    "-priority", "1",
    "-m",
    "`"$Profile`""
)

Write-GuardLog "Starting SyncBackFree: $syncBackExe $($arguments -join ' ')"
if ($DryRun) {
    Write-GuardLog "DryRun enabled; not launching SyncBackFree."
    exit 0
}

$process = Start-Process -FilePath $syncBackExe -ArgumentList $arguments -PassThru
Start-Sleep -Seconds 3

try {
    $process.Refresh()
    $process.PriorityClass = "Idle"
    Write-GuardLog "Set SyncBackFree process priority to Idle. pid=$($process.Id)"
} catch {
    Write-GuardLog "Could not set SyncBackFree priority. Error=$($_.Exception.Message)"
}

Write-GuardLog "SyncBackGentle launched profile."
