@echo off
rem HRM HYDRAULIC MANAGEMENT - one-file setup: makes a desktop icon that opens the program
rem in its own window (Edge or Chrome), maximised, 1920 x 1080 layout. Double-click to run.
title HRM Hydraulic Management - desktop icon
echo.
echo  Creating the desktop icon ...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[IO.File]::ReadAllText('%~f0'); $i=$s.LastIndexOf('#==PS==#'); Invoke-Expression $s.Substring($i)"
echo.
echo  Done. Open "HRM Hydraulic Management" on the desktop.
echo  First time: enter the Web App link, SYNC_KEY and a name for this PC.
echo.
pause
exit /b
#==PS==#
# HRM HYDRAULIC MANAGEMENT - desktop icon that opens the web app in its own window (Edge / Chrome app mode)
$url  = 'https://hrm-hyd-management.vercel.app/desk/'
$name = 'HRM Hydraulic Management'
$dir  = Join-Path $env:LOCALAPPDATA 'HRM Hydraulic Web'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ico   = Join-Path $dir 'hrm.ico'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
try { Invoke-WebRequest -UseBasicParsing -Uri ($url + 'hrm.ico') -OutFile $ico } catch { Write-Host 'Icon download failed - the shortcut will use the browser icon.' }

$browsers = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$exe = $browsers | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell

if ($exe) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop "$name.lnk"))
  $lnk.TargetPath  = $exe
  # show the program as a 1920 x 1080 layout on any screen: zoom = screen width / 1920 (own browser profile so the zoom always applies)
  $w = 1920
  try { $w = [int](Get-CimInstance Win32_VideoController | Where-Object { $_.CurrentHorizontalResolution } | Select-Object -First 1).CurrentHorizontalResolution } catch { }
  if (-not $w -or $w -lt 800) { $w = 1920 }
  $zoom = [math]::Round($w / 1920, 3).ToString([Globalization.CultureInfo]::InvariantCulture)
  $prof = Join-Path $dir 'profile'
  $lnk.Arguments   = "--app=$url --user-data-dir=`"$prof`" --force-device-scale-factor=$zoom --start-maximized"
  $lnk.Description = 'HRM Hydraulic Management (web)'
  if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
  $lnk.Save()
  Write-Host "OK  Desktop icon -> $url  (own window, 1920 x 1080 layout, zoom $zoom)"
} else {
  $file = Join-Path $desktop "$name.url"
  "[InternetShortcut]`r`nURL=$url`r`nIconFile=$ico`r`nIconIndex=0`r`n" | Set-Content -Encoding ASCII $file
  Write-Host "OK  Desktop link -> $url"
}
