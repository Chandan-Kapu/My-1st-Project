<#
.SYNOPSIS
    Starts the Training folder watcher now and at every Windows sign-in.
    Run with -Uninstall to stop it and remove it from startup.
#>
param(
    [string]$TrainingDir = 'C:\Users\chand\OneDrive\Desktop\claude\Training',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$watcher = Join-Path $PSScriptRoot 'watch_training.ps1'
$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Applied_AI_Test_Skill watcher.lnk'

# Stop any running watcher.
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe' OR Name = 'pwsh.exe'" |
    Where-Object { $_.CommandLine -like '*watch_training.ps1*' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

if ($Uninstall) {
    Remove-Item $shortcut -ErrorAction SilentlyContinue
    Write-Host 'Watcher stopped and removed from startup.'
    return
}

$arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$watcher`" -TrainingDir `"$TrainingDir`""

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($shortcut)
$link.TargetPath = 'powershell.exe'
$link.Arguments = $arguments
$link.WorkingDirectory = $PSScriptRoot
$link.WindowStyle = 7  # minimized
$link.Save()

Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden
Write-Host "Watcher started. It will also start at each sign-in."
Write-Host "Log: $(Join-Path $TrainingDir 'Summaries\watcher.log')"
