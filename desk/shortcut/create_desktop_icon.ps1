# HRM HYDRAULIC MANAGEMENT - desktop icon that opens the web app in its own window (Edge / Chrome app mode)
$url  = 'https://hotrollingrm-dev.github.io/HRM-HYD-MANAGEMENT/desk/'
$name = 'HRM Hydraulic Management'
$dir  = Join-Path $env:LOCALAPPDATA 'HRM Hydraulic Web'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$ico   = Join-Path $dir 'hrm.ico'
$local = Join-Path $PSScriptRoot 'hrm.ico'
if (Test-Path $local) { Copy-Item $local $ico -Force }
else { try { Invoke-WebRequest -UseBasicParsing -Uri ($url + 'hrm.ico') -OutFile $ico } catch { } }

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
  $lnk.Arguments   = "--app=$url"
  $lnk.Description = 'HRM Hydraulic Management (web)'
  if (Test-Path $ico) { $lnk.IconLocation = "$ico,0" }
  $lnk.Save()
  Write-Host "OK  Desktop icon -> $url  (opens in its own window)"
} else {
  $file = Join-Path $desktop "$name.url"
  "[InternetShortcut]`r`nURL=$url`r`nIconFile=$ico`r`nIconIndex=0`r`n" | Set-Content -Encoding ASCII $file
  Write-Host "OK  Desktop link -> $url"
}
