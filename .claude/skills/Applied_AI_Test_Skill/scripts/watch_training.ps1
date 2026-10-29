<#
.SYNOPSIS
    Watches the Training folder and runs Claude Code with Applied_AI_Test_Skill
    whenever a new PowerPoint deck is saved there.

.DESCRIPTION
    A deck counts as new when Summaries\<deck name>_summary.md does not exist.
    The watcher waits until the file has stopped changing (PowerPoint and OneDrive
    write in several steps), then runs `claude -p` from the repository root so the
    project skill is available. Each deck is attempted once per saved version, so
    a failed run is not retried in a loop; saving the deck again retries it.
    Activity is logged to Summaries\watcher.log.
#>
param(
    [string]$TrainingDir = 'C:\Users\chand\OneDrive\Desktop\claude\Training',
    [int]$PollSeconds = 60,
    [int]$SettleSeconds = 20
)

$ErrorActionPreference = 'Stop'
$RepoDir = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$SummaryDir = Join-Path $TrainingDir 'Summaries'
$LogFile = Join-Path $SummaryDir 'watcher.log'

function Write-Log([string]$Message) {
    $line = '{0:yyyy-MM-dd HH:mm:ss}  {1}' -f (Get-Date), $Message
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

function Test-FileReady([System.IO.FileInfo]$File) {
    if (((Get-Date) - $File.LastWriteTime).TotalSeconds -lt $SettleSeconds) { return $false }
    try {
        $stream = [System.IO.File]::Open($File.FullName, 'Open', 'Read', 'None')
        $stream.Close()
        return $true
    } catch {
        return $false  # still open in PowerPoint or being synced
    }
}

function Invoke-Summary([System.IO.FileInfo]$Deck) {
    Write-Log "Summarizing $($Deck.Name)"
    $prompt = "Use the Applied_AI_Test_Skill skill to summarize this new PowerPoint deck: `"$($Deck.FullName)`". " +
              "Write the summary file exactly as the skill describes. Do not ask questions; this is an unattended run."
    Push-Location $RepoDir
    try {
        $output = & claude -p $prompt `
            --add-dir $TrainingDir `
            --allowedTools 'Bash(python *)' 'Bash(py *)' 'Read' 'Write' 'Edit' 'Glob' 2>&1 | Out-String
        $exitCode = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    $summary = Join-Path $SummaryDir "$($Deck.BaseName)_summary.md"
    if ($exitCode -eq 0 -and (Test-Path $summary)) {
        Write-Log "Done: $summary"
    } else {
        Write-Log "FAILED for $($Deck.Name) (exit code $exitCode). Save the deck again to retry. Claude output:`n$output"
    }
}

# Only one watcher at a time.
$mutex = New-Object System.Threading.Mutex($false, 'Local\Applied_AI_Test_Skill_Watcher')
if (-not $mutex.WaitOne(0)) { Write-Host 'Watcher is already running.'; exit 0 }

if (-not (Test-Path $TrainingDir)) { throw "Training folder not found: $TrainingDir" }
New-Item -ItemType Directory -Force -Path $SummaryDir | Out-Null
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Log 'ERROR: the claude command was not found on PATH. Install Claude Code and sign in, then restart the watcher.'
    exit 1
}

# File events wake the loop right away; the timeout is a fallback scan.
$fsw = New-Object System.IO.FileSystemWatcher($TrainingDir, '*.ppt*')
$fsw.IncludeSubdirectories = $false
$fsw.EnableRaisingEvents = $true
foreach ($evt in 'Created', 'Changed', 'Renamed') {
    Register-ObjectEvent -InputObject $fsw -EventName $evt -SourceIdentifier "TrainingPpt$evt" | Out-Null
}

$attempted = @{}  # full path -> LastWriteTimeUtc already attempted
Write-Log "Watching $TrainingDir (repo: $RepoDir)"

while ($true) {
    $decks = Get-ChildItem -Path $TrainingDir -File |
        Where-Object { $_.Extension -in '.pptx', '.ppt' -and -not $_.Name.StartsWith('~$') }
    foreach ($deck in $decks) {
        if (Test-Path (Join-Path $SummaryDir "$($deck.BaseName)_summary.md")) { continue }
        if ($attempted[$deck.FullName] -eq $deck.LastWriteTimeUtc) { continue }
        if (-not (Test-FileReady $deck)) { continue }
        $attempted[$deck.FullName] = $deck.LastWriteTimeUtc
        if ($deck.Extension -eq '.ppt') {
            Write-Log "Skipped $($deck.Name): legacy .ppt format. Save it as .pptx in PowerPoint."
            continue
        }
        Invoke-Summary $deck
    }

    # Sleep until a file event arrives or the poll interval passes; after an
    # event, give the save time to finish before scanning.
    $woke = Wait-Event -Timeout $PollSeconds
    if ($woke) {
        Start-Sleep -Seconds $SettleSeconds
        Get-Event | Remove-Event
    }
}
