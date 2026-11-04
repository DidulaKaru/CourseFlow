# Start local CourseFlow PostgreSQL server on port 5433
$pgData = "C:\Users\didul\courseflow_pgdata"
$pgBin = "C:\Program Files\PostgreSQL\18\bin"

$conn = Get-NetTCPConnection -LocalPort 5433 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[OK] PostgreSQL is already running on port 5433." -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $pgData)) {
    Write-Host "[INIT] Initializing database cluster at $pgData..." -ForegroundColor Yellow
    $pwfile = New-TemporaryFile
    Set-Content -Path $pwfile -Value "CourseFlow5678db"
    & "$pgBin\initdb.exe" -U postgres -A scram-sha-256 --pwfile=$pwfile -D $pgData
    Remove-Item -Force $pwfile
}

# Clean stale postmaster.pid if process is not running
$pidFile = "$pgData\postmaster.pid"
if (Test-Path $pidFile) {
    $lines = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($lines -and $lines.Count -gt 0) {
        $stalePid = [int]$lines[0]
        $proc = Get-Process -Id $stalePid -ErrorAction SilentlyContinue
        if (-not $proc) {
            Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "[START] Starting PostgreSQL on port 5433..." -ForegroundColor Cyan
Start-Process -FilePath "$pgBin\postgres.exe" -ArgumentList "-D `"$pgData`" -p 5433" -WindowStyle Hidden

$started = $false
for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Seconds 1
    $conn = Get-NetTCPConnection -LocalPort 5433 -ErrorAction SilentlyContinue
    if ($conn) {
        $started = $true
        break
    }
}

if ($started) {
    Write-Host "[OK] PostgreSQL started successfully on port 5433." -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start PostgreSQL on port 5433." -ForegroundColor Red
}
