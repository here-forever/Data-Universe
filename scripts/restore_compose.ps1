param(
    [Parameter(Mandatory = $true)][string]$BackupDirectory,
    [string]$ComposeProject = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$backupRoot = (Resolve-Path -LiteralPath $BackupDirectory).Path
$databaseDump = Join-Path $backupRoot "database.dump"
$storageBackup = Join-Path $backupRoot "storage"
if (-not (Test-Path -LiteralPath $databaseDump -PathType Leaf)) {
    throw "Database dump not found: $databaseDump"
}
if (-not (Test-Path -LiteralPath $storageBackup -PathType Container)) {
    throw "Storage backup not found: $storageBackup"
}
if (-not $Force) {
    throw "Restore replaces the active database and storage. Re-run with -Force after verifying the backup path."
}

function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $composeArguments = @("compose")
    if ($ComposeProject) {
        $composeArguments += @("-p", $ComposeProject)
    }
    $composeArguments += $Arguments
    & docker @composeArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker Compose command failed: docker $($composeArguments -join ' ')"
    }
}

Invoke-Compose stop backend frontend
try {
    Invoke-Compose cp $databaseDump "postgres:/tmp/data-analysis.dump"
    Invoke-Compose exec -T postgres sh -c 'pg_restore --clean --if-exists --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB" /tmp/data-analysis.dump'
    Invoke-Compose exec -T postgres rm -f /tmp/data-analysis.dump
    Invoke-Compose run --rm --no-deps backend sh -c 'find /app/storage -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +'
    Invoke-Compose cp "$storageBackup\." "backend:/app/storage"
}
finally {
    Invoke-Compose start backend frontend
}

Invoke-Compose exec -T backend python -m alembic upgrade head
Write-Host "Restore complete. Run scripts/validate_release.py before reopening the workspace."
