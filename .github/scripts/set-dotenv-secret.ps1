#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Encode a local dotenv file to base64 and store it as the DOTENV_B64_<APP_ENV>
  repo secret consumed by the "Tests" workflow (.github/workflows/ci.yml).

.DESCRIPTION
  One-shot replacement for the manual "read bytes -> base64 -> gh secret set" snippet.
  Reads environments\.<AppEnv>.env if it exists (falling back to environments\.env),
  base64-encodes the whole file, and sets the repo secret DOTENV_B64_<AppEnv> via the
  GitHub CLI. Paths are resolved relative to the repo root, so it works from any
  working directory. The file contents are never printed - only a byte count -
  matching the workflow's own logging convention.

.PARAMETER AppEnv
  The app_env this secret is for (e.g. DEMO, STAGE). Drives the secret name
  (DOTENV_B64_<AppEnv>) and the preferred source file (environments\.<AppEnv>.env).
  Use only letters, digits and underscores - GitHub secret names allow nothing else.

.PARAMETER Repo
  Target repository (owner/name). Optional - when omitted, gh infers it from the
  current directory's git remote.

.PARAMETER Path
  Override the source dotenv file. Defaults to <repo-root>\environments\.<AppEnv>.env
  when that file exists, otherwise <repo-root>\environments\.env.

.EXAMPLE
  .\.github\scripts\set-dotenv-secret.ps1 DEMO

.EXAMPLE
  .\.github\scripts\set-dotenv-secret.ps1 -AppEnv STAGE -Path C:\tmp\stage.env

.NOTES
  Requires the GitHub CLI (https://cli.github.com/) authenticated with repo admin:
  run 'gh auth login' first.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory, Position = 0)]
  [ValidatePattern('^[A-Za-z0-9_]+$')]
  [string] $AppEnv,

  [string] $Repo,

  [string] $Path
)

$ErrorActionPreference = 'Stop'

# Resolve the source dotenv file relative to the repo root (this script lives in
# <root>/.github/scripts/), unless an explicit -Path was given. Prefer the
# per-environment file; fall back to the shared environments/.env.
if (-not $Path) {
  $repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  $perEnv = Join-Path $repoRoot "environments/.$AppEnv.env"
  $shared = Join-Path $repoRoot 'environments/.env'
  $Path = if (Test-Path -LiteralPath $perEnv -PathType Leaf) { $perEnv } else { $shared }
}

if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
  throw "dotenv file not found: $Path"
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  throw "GitHub CLI (gh) not found on PATH. Install it (https://cli.github.com/) and run 'gh auth login'."
}

$secretName = "DOTENV_B64_$AppEnv"
$bytes = [IO.File]::ReadAllBytes($Path)
$b64   = [Convert]::ToBase64String($bytes)

$ghArgs = @('secret', 'set', $secretName)
if ($Repo) { $ghArgs += @('--repo', $Repo) }

Write-Host "Setting $secretName from $Path ($($bytes.Length) bytes) - contents not logged"
$b64 | gh @ghArgs
if ($LASTEXITCODE -ne 0) {
  throw "gh secret set failed (exit $LASTEXITCODE)."
}
Write-Host "Done - $secretName updated."
