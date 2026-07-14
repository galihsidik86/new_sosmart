# auto-pull.ps1
# Cek update di remote GitHub, lalu pull otomatis jika ada perubahan.
# Dijalankan berkala oleh Windows Task Scheduler.

$ErrorActionPreference = 'Stop'
$RepoPath = 'C:\Users\we\lentera\new_sosmart'
$Branch   = 'main'
$LogFile  = Join-Path $RepoPath 'auto-pull.log'

function Write-Log($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    Add-Content -Path $LogFile -Value "[$ts] $msg"
}

try {
    Set-Location $RepoPath

    # Ambil info terbaru dari remote tanpa mengubah working tree
    git fetch origin $Branch --quiet

    $local  = (git rev-parse $Branch).Trim()
    $remote = (git rev-parse "origin/$Branch").Trim()

    if ($local -eq $remote) {
        # Tidak ada update — diam saja (uncomment untuk logging verbose)
        # Write-Log "Sudah up-to-date ($local)."
        exit 0
    }

    Write-Log "Update terdeteksi: $local -> $remote. Menjalankan pull..."
    $output = git pull origin $Branch 2>&1 | Out-String
    Write-Log "Hasil pull:`n$output"
}
catch {
    Write-Log "ERROR: $_"
    exit 1
}
