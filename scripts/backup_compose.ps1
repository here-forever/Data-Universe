param(
    [string]$OutputDirectory = "",
    [string]$ComposeProject = ""
)

$ErrorActionPreference = "Stop"
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path $repositoryRoot "backups\data-analysis-$timestamp"
}
$backupRoot = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null

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

$databaseDump = Join-Path $backupRoot "database.dump"
$storageBackup = Join-Path $backupRoot "storage"

Invoke-Compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl --file=/tmp/data-analysis.dump'
Invoke-Compose cp "postgres:/tmp/data-analysis.dump" $databaseDump
Invoke-Compose exec -T postgres rm -f /tmp/data-analysis.dump
Invoke-Compose cp "backend:/app/storage" $storageBackup

$migration = (Invoke-Compose exec -T backend python -m alembic current | Out-String).Trim()
$gitCommit = (& git -C $repositoryRoot rev-parse HEAD 2>$null | Out-String).Trim()
$manifest = [ordered]@{
    created_at = (Get-Date).ToUniversalTime().ToString("o")
    database_dump = "database.dump"
    storage_directory = "storage"
    migration = $migration
    git_commit = $gitCommit
}
$manifest | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupRoot "manifest.json") -Encoding utf8

Write-Host "Backup complete: $backupRoot"
